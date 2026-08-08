import { EmailSchema } from "@stock42/contracts/common";
import { isIP } from "node:net";
import { z } from "zod";

const BooleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const OptionalStringSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

function looksLikePlaceholder(value: string): boolean {
  return /(replace|change[-_ ]?me|placeholder|example|at[-_ ]?least)/i.test(value);
}

function isPrivateAgentUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname === "::1") return true;
  if (hostname.includes(":")) return hostname.startsWith("fc") || hostname.startsWith("fd");
  if (!hostname.includes(".")) return true;
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }
  const secondOctet = Number(hostname.match(/^172\.(\d+)\./)?.[1]);
  return (
    (Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31) ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.endsWith(".internal")
  );
}

const PositiveIntegerSchema = (fallback: string) =>
  z.coerce.number().int().positive().default(Number(fallback));

const ApiConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3822),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().min(1),
    DEFAULT_ADMIN_BOOTSTRAP_ENABLED: BooleanStringSchema,
    DEFAULT_ADMIN_EMAIL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      EmailSchema.optional(),
    ),
    DEFAULT_ADMIN_PASSWORD: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(12).max(256).optional(),
    ),
    AUTH_ACCESS_SECRET: z.string().min(32),
    AUTH_REFRESH_SECRET: z.string().min(32),
    CSRF_SECRET: z.string().min(32),
    WEBSOCKET_TICKET_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().default("*"),
    COOKIE_SECURE: BooleanStringSchema,
    ACCESS_TOKEN_TTL_SECONDS: PositiveIntegerSchema("900"),
    REFRESH_TOKEN_TTL_SECONDS: PositiveIntegerSchema("604800"),
    AGENT_INTERNAL_URL: z.string().url().default("http://127.0.0.1:4100"),
    ALLOW_PUBLIC_AGENT_URL: BooleanStringSchema,
    AGENT_SERVICE_TOKEN: z.string().min(32),
    TRUSTED_PROXIES: OptionalStringSchema,
    RATE_LIMIT_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    RATE_LIMIT_WINDOW_SECONDS: PositiveIntegerSchema("60"),
    RATE_LIMIT_REQUESTS: PositiveIntegerSchema("120"),
    RATE_LIMIT_LOGIN_REQUESTS: PositiveIntegerSchema("10"),
    RATE_LIMIT_AGENT_REQUESTS: PositiveIntegerSchema("20"),
    API_TEST_ENABLED: BooleanStringSchema,
    API_TEST_SEEDS: BooleanStringSchema,
    TEST_TENANT_ID: z.string().uuid().optional().or(z.literal("")),
  })
  .superRefine((value, context) => {
    if (
      value.TRUSTED_PROXIES?.split(",")
        .map((proxy) => proxy.trim())
        .filter(Boolean)
        .some((proxy) => isIP(proxy.replace(/^::ffff:/, "")) === 0)
    ) {
      context.addIssue({ code: "custom", path: ["TRUSTED_PROXIES"], message: "Invalid IP" });
    }
    if (value.DEFAULT_ADMIN_BOOTSTRAP_ENABLED) {
      if (!value.DEFAULT_ADMIN_EMAIL) {
        context.addIssue({ code: "custom", path: ["DEFAULT_ADMIN_EMAIL"], message: "Required" });
      }
      if (!value.DEFAULT_ADMIN_PASSWORD) {
        context.addIssue({ code: "custom", path: ["DEFAULT_ADMIN_PASSWORD"], message: "Required" });
      }
    }
    if (value.NODE_ENV !== "production") return;
    if (value.CORS_ORIGINS.split(",").some((origin) => origin.trim() === "*")) {
      context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Wildcard forbidden" });
    }
    if (looksLikePlaceholder(value.CORS_ORIGINS)) {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "Placeholder forbidden",
      });
    }
    if (!value.COOKIE_SECURE) {
      context.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "Required" });
    }
    if (value.API_TEST_ENABLED || value.API_TEST_SEEDS) {
      context.addIssue({ code: "custom", path: ["API_TEST_ENABLED"], message: "Forbidden" });
    }
    if (!value.RATE_LIMIT_ENABLED) {
      context.addIssue({ code: "custom", path: ["RATE_LIMIT_ENABLED"], message: "Required" });
    }
    if (!value.ALLOW_PUBLIC_AGENT_URL && !isPrivateAgentUrl(value.AGENT_INTERNAL_URL)) {
      context.addIssue({
        code: "custom",
        path: ["AGENT_INTERNAL_URL"],
        message: "Must be private",
      });
    }
    const secrets = [
      ["AUTH_ACCESS_SECRET", value.AUTH_ACCESS_SECRET],
      ["AUTH_REFRESH_SECRET", value.AUTH_REFRESH_SECRET],
      ["CSRF_SECRET", value.CSRF_SECRET],
      ["WEBSOCKET_TICKET_SECRET", value.WEBSOCKET_TICKET_SECRET],
      ["AGENT_SERVICE_TOKEN", value.AGENT_SERVICE_TOKEN],
    ] as const;
    for (const [key, secret] of secrets) {
      if (looksLikePlaceholder(secret)) {
        context.addIssue({ code: "custom", path: [key], message: "Placeholder forbidden" });
      }
    }
    if (new Set(secrets.map(([, secret]) => secret)).size !== secrets.length) {
      context.addIssue({ code: "custom", path: ["AUTH_ACCESS_SECRET"], message: "Secrets reused" });
    }
  })
  .transform((value) => ({
    environment: value.NODE_ENV,
    host: value.API_HOST,
    port: value.API_PORT,
    mongo: {
      uri: value.MONGODB_URI,
      database: value.MONGODB_DB,
    },
    defaultAdministrator:
      value.DEFAULT_ADMIN_BOOTSTRAP_ENABLED &&
      value.DEFAULT_ADMIN_EMAIL &&
      value.DEFAULT_ADMIN_PASSWORD
        ? { email: value.DEFAULT_ADMIN_EMAIL, password: value.DEFAULT_ADMIN_PASSWORD }
        : null,
    auth: {
      accessSecret: value.AUTH_ACCESS_SECRET,
      refreshSecret: value.AUTH_REFRESH_SECRET,
      csrfSecret: value.CSRF_SECRET,
      websocketTicketSecret: value.WEBSOCKET_TICKET_SECRET,
      accessTtlSeconds: value.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: value.REFRESH_TOKEN_TTL_SECONDS,
      secureCookies: value.COOKIE_SECURE,
    },
    corsOrigins: value.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    agent: {
      url: value.AGENT_INTERNAL_URL,
      serviceToken: value.AGENT_SERVICE_TOKEN,
    },
    trustedProxies: (value.TRUSTED_PROXIES ?? "")
      .split(",")
      .map((proxy) => proxy.trim())
      .filter(Boolean),
    rateLimit: {
      enabled: value.RATE_LIMIT_ENABLED,
      windowSeconds: value.RATE_LIMIT_WINDOW_SECONDS,
      requests: value.RATE_LIMIT_REQUESTS,
      loginRequests: value.RATE_LIMIT_LOGIN_REQUESTS,
      agentRequests: value.RATE_LIMIT_AGENT_REQUESTS,
    },
    testing: {
      enabled: value.API_TEST_ENABLED,
      seeds: value.API_TEST_SEEDS,
      tenantId: value.TEST_TENANT_ID || undefined,
    },
  }));

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function loadConfig(environment: Record<string, string | undefined> = Bun.env): ApiConfig {
  const result = ApiConfigSchema.safeParse(environment);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuración de API inválida. Revisar: ${keys}`);
  }
  return result.data;
}

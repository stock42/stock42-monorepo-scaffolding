import { EmailSchema } from "@stock42/contracts/common";
import { WebSocketPublicUrlSchema } from "@stock42/contracts/websocket";
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
    WEBSOCKET_PUBLIC_URL: WebSocketPublicUrlSchema.default("ws://127.0.0.1:3822/ws"),
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
    EMAIL_SPOOLER_ENABLED: BooleanStringSchema,
    SMTP_HOST: OptionalStringSchema,
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: BooleanStringSchema,
    SMTP_USER: OptionalStringSchema,
    SMTP_PASS: OptionalStringSchema,
    MAIL_FROM: z.preprocess((value) => (value === "" ? undefined : value), EmailSchema.optional()),
    EMAIL_SPOOLER_INTERVAL_MS: PositiveIntegerSchema("60000"),
    EMAIL_SPOOLER_BATCH_SIZE: PositiveIntegerSchema("25"),
    EMAIL_SPOOLER_MAX_ATTEMPTS: PositiveIntegerSchema("3"),
    EMAIL_SPOOLER_LEASE_MS: PositiveIntegerSchema("300000"),
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
    if (value.EMAIL_SPOOLER_ENABLED) {
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const) {
        if (!value[key]) {
          context.addIssue({ code: "custom", path: [key], message: "Required" });
        }
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
    const publicWebSocketUrl = new URL(value.WEBSOCKET_PUBLIC_URL);
    if (
      publicWebSocketUrl.protocol !== "wss:" ||
      looksLikePlaceholder(publicWebSocketUrl.hostname)
    ) {
      context.addIssue({
        code: "custom",
        path: ["WEBSOCKET_PUBLIC_URL"],
        message: "Production WebSocket URL must use wss and a real hostname",
      });
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
    websocket: {
      publicUrl: value.WEBSOCKET_PUBLIC_URL,
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
    email: {
      enabled: value.EMAIL_SPOOLER_ENABLED,
      configured: Boolean(value.SMTP_HOST && value.SMTP_USER && value.SMTP_PASS && value.MAIL_FROM),
      smtp: {
        host: value.SMTP_HOST,
        port: value.SMTP_PORT,
        secure: value.SMTP_SECURE,
        user: value.SMTP_USER,
        pass: value.SMTP_PASS,
      },
      from: value.MAIL_FROM,
      intervalMs: value.EMAIL_SPOOLER_INTERVAL_MS,
      batchSize: Math.min(value.EMAIL_SPOOLER_BATCH_SIZE, 100),
      maxAttempts: Math.min(value.EMAIL_SPOOLER_MAX_ATTEMPTS, 10),
      leaseMs: value.EMAIL_SPOOLER_LEASE_MS,
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

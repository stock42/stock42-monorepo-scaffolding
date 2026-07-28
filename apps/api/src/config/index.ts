import { EmailSchema } from "@stock42/contracts/common";
import { z } from "zod";

const BooleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const PositiveIntegerSchema = (fallback: string) =>
  z.coerce.number().int().positive().default(Number(fallback));

const ApiConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3822),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().min(1),
    DEFAULT_ADMIN_EMAIL: EmailSchema,
    DEFAULT_ADMIN_PASSWORD: z.string().min(12).max(256),
    AUTH_ACCESS_SECRET: z.string().min(32),
    AUTH_REFRESH_SECRET: z.string().min(32),
    CSRF_SECRET: z.string().min(32),
    WEBSOCKET_TICKET_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().default("*"),
    COOKIE_SECURE: BooleanStringSchema,
    ACCESS_TOKEN_TTL_SECONDS: PositiveIntegerSchema("900"),
    REFRESH_TOKEN_TTL_SECONDS: PositiveIntegerSchema("604800"),
    AGENT_INTERNAL_URL: z.string().url().default("http://127.0.0.1:4100"),
    AGENT_SERVICE_TOKEN: z.string().min(32),
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
  .transform((value) => ({
    environment: value.NODE_ENV,
    host: value.API_HOST,
    port: value.API_PORT,
    mongo: {
      uri: value.MONGODB_URI,
      database: value.MONGODB_DB,
    },
    defaultAdministrator: {
      email: value.DEFAULT_ADMIN_EMAIL,
      password: value.DEFAULT_ADMIN_PASSWORD,
    },
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

import { resolve } from "node:path";
import { z } from "zod";

const PositiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const BooleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const AgentConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    AGENT_HOST: z.string().min(1).default("127.0.0.1"),
    AGENT_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().min(1),
    AGENT_SERVICE_TOKEN: z.string().min(32),
    DEEPSEEK_API_KEY: z.string().min(1),
    DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
    DEEPSEEK_MODEL: z.literal("deepseek-v4-pro").default("deepseek-v4-pro"),
    DEEPSEEK_REASONING_EFFORT: z.enum(["high", "max"]).default("high"),
    AGENT_LAUNCH_INTERVAL_MS: PositiveInteger(1_000),
    AGENT_SUPERVISOR_INTERVAL_MS: PositiveInteger(2_000),
    AGENT_GLOBAL_CONCURRENCY: PositiveInteger(4),
    AGENT_TENANT_CONCURRENCY: PositiveInteger(2),
    AGENT_HEARTBEAT_MS: PositiveInteger(5_000),
    AGENT_INACTIVITY_TIMEOUT_MS: PositiveInteger(120_000),
    AGENT_RUN_TIMEOUT_MS: PositiveInteger(900_000),
    AGENT_CANCEL_GRACE_MS: PositiveInteger(10_000),
    UPLOAD_STORAGE_PATH: z.string().min(1).default("./uploads"),
    ARTIFACT_STORAGE_PATH: z.string().min(1).default("./artifacts"),
    MAX_UPLOAD_BYTES: PositiveInteger(10 * 1024 * 1024),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_POLLING_ENABLED: BooleanString,
    TELEGRAM_API_BASE_URL: z.string().url().default("https://api.telegram.org"),
    TELEGRAM_POLL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(50).default(25),
    TELEGRAM_POLL_BACKOFF_MIN_MS: PositiveInteger(1_000),
    TELEGRAM_POLL_BACKOFF_MAX_MS: PositiveInteger(30_000),
    TELEGRAM_DELIVERY_INTERVAL_MS: PositiveInteger(1_000),
  })
  .superRefine((value, context) => {
    if (value.TELEGRAM_POLL_BACKOFF_MAX_MS < value.TELEGRAM_POLL_BACKOFF_MIN_MS) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_POLL_BACKOFF_MAX_MS"],
        message: "El backoff máximo no puede ser menor al mínimo.",
      });
    }
  })
  .transform((value) => ({
    environment: value.NODE_ENV,
    host: value.AGENT_HOST,
    port: value.AGENT_PORT,
    mongo: { uri: value.MONGODB_URI, database: value.MONGODB_DB },
    serviceToken: value.AGENT_SERVICE_TOKEN,
    deepseek: {
      apiKey: value.DEEPSEEK_API_KEY,
      baseUrl: value.DEEPSEEK_BASE_URL,
      model: value.DEEPSEEK_MODEL,
      reasoningEffort: value.DEEPSEEK_REASONING_EFFORT,
    },
    runtime: {
      launchIntervalMs: value.AGENT_LAUNCH_INTERVAL_MS,
      supervisorIntervalMs: value.AGENT_SUPERVISOR_INTERVAL_MS,
      globalConcurrency: value.AGENT_GLOBAL_CONCURRENCY,
      tenantConcurrency: value.AGENT_TENANT_CONCURRENCY,
      heartbeatMs: value.AGENT_HEARTBEAT_MS,
      inactivityTimeoutMs: value.AGENT_INACTIVITY_TIMEOUT_MS,
      runTimeoutMs: value.AGENT_RUN_TIMEOUT_MS,
      cancelGraceMs: value.AGENT_CANCEL_GRACE_MS,
    },
    storage: {
      uploadPath: resolve(value.UPLOAD_STORAGE_PATH),
      artifactPath: resolve(value.ARTIFACT_STORAGE_PATH),
      maxUploadBytes: value.MAX_UPLOAD_BYTES,
    },
    telegram: {
      botToken: value.TELEGRAM_BOT_TOKEN || undefined,
      pollingEnabled: value.TELEGRAM_POLLING_ENABLED && Boolean(value.TELEGRAM_BOT_TOKEN),
      apiBaseUrl: value.TELEGRAM_API_BASE_URL,
      pollTimeoutSeconds: value.TELEGRAM_POLL_TIMEOUT_SECONDS,
      backoffMinMs: value.TELEGRAM_POLL_BACKOFF_MIN_MS,
      backoffMaxMs: value.TELEGRAM_POLL_BACKOFF_MAX_MS,
      deliveryIntervalMs: value.TELEGRAM_DELIVERY_INTERVAL_MS,
    },
  }));

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function loadAgentConfig(
  environment: Record<string, string | undefined> = Bun.env,
): AgentConfig {
  const result = AgentConfigSchema.safeParse(environment);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuración del agente inválida. Revisar: ${keys}`);
  }
  return result.data;
}

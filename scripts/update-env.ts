import { randomBytes } from "node:crypto";
import { chmod, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export const APP_NAMES = ["api", "agent", "webapp", "backoffice"] as const;
export const SCENARIOS = ["development", "test", "production"] as const;

export type AppName = (typeof APP_NAMES)[number];
export type Scenario = (typeof SCENARIOS)[number];
export type AppEnvValues = Record<AppName, Record<string, string>>;

export type PromptTarget = {
  apps: readonly AppName[];
  key: string;
};

type AppEnvironment = {
  path: string;
  source?: string;
  values: Record<string, string>;
};

const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
const scenarioLabels: Record<Scenario, string> = {
  development: "Desarrollo local",
  test: "Tests locales",
  production: "Producción",
};
const sharedTargets: readonly PromptTarget[] = [
  { apps: ["api", "agent"], key: "MONGODB_URI" },
  { apps: ["api", "agent"], key: "MONGODB_DB" },
  { apps: ["api", "agent"], key: "AGENT_SERVICE_TOKEN" },
  { apps: ["webapp", "backoffice"], key: "API_INTERNAL_URL" },
];
const scenarioControlledKeys = new Set([
  "NODE_ENV",
  "CORS_ORIGINS",
  "COOKIE_SECURE",
  "API_TEST_ENABLED",
  "API_TEST_SEEDS",
  "TELEGRAM_POLLING_ENABLED",
]);
const secretKeys = new Set([
  "MONGODB_URI",
  "AGENT_SERVICE_TOKEN",
  "AUTH_ACCESS_SECRET",
  "AUTH_REFRESH_SECRET",
  "CSRF_SECRET",
  "WEBSOCKET_TICKET_SECRET",
  "DEEPSEEK_API_KEY",
  "TELEGRAM_BOT_TOKEN",
]);
const generatedSecretKeys = new Set([
  "AGENT_SERVICE_TOKEN",
  "AUTH_ACCESS_SECRET",
  "AUTH_REFRESH_SECRET",
  "CSRF_SECRET",
  "WEBSOCKET_TICKET_SECRET",
]);
const longSecretKeys = new Set(generatedSecretKeys);
const optionalKeys = new Set(["TEST_TENANT_ID", "TELEGRAM_BOT_TOKEN"]);
const booleanKeys = new Set([
  "COOKIE_SECURE",
  "RATE_LIMIT_ENABLED",
  "API_TEST_ENABLED",
  "API_TEST_SEEDS",
  "TELEGRAM_POLLING_ENABLED",
]);
const integerKeys = new Set([
  "API_PORT",
  "WEBAPP_PORT",
  "BACKOFFICE_PORT",
  "ACCESS_TOKEN_TTL_SECONDS",
  "REFRESH_TOKEN_TTL_SECONDS",
  "RATE_LIMIT_WINDOW_SECONDS",
  "RATE_LIMIT_REQUESTS",
  "RATE_LIMIT_LOGIN_REQUESTS",
  "RATE_LIMIT_AGENT_REQUESTS",
  "AGENT_PORT",
  "AGENT_LAUNCH_INTERVAL_MS",
  "AGENT_SUPERVISOR_INTERVAL_MS",
  "AGENT_GLOBAL_CONCURRENCY",
  "AGENT_TENANT_CONCURRENCY",
  "AGENT_HEARTBEAT_MS",
  "AGENT_INACTIVITY_TIMEOUT_MS",
  "AGENT_RUN_TIMEOUT_MS",
  "AGENT_CANCEL_GRACE_MS",
  "MAX_UPLOAD_BYTES",
  "TELEGRAM_POLL_TIMEOUT_SECONDS",
  "TELEGRAM_POLL_BACKOFF_MIN_MS",
  "TELEGRAM_POLL_BACKOFF_MAX_MS",
  "TELEGRAM_DELIVERY_INTERVAL_MS",
]);
const httpUrlKeys = new Set([
  "API_INTERNAL_URL",
  "AGENT_INTERNAL_URL",
  "DEEPSEEK_BASE_URL",
  "TELEGRAM_API_BASE_URL",
]);

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function buildScenarioDefaults(
  scenario: Scenario,
  createSecret: () => string = randomSecret,
): AppEnvValues {
  const agentServiceToken = createSecret();
  const corsOrigins =
    scenario === "production"
      ? "https://example.com,https://backoffice.example.com"
      : scenario === "test"
        ? "http://127.0.0.1:3820,http://127.0.0.1:3821"
        : "*";

  return {
    api: {
      NODE_ENV: scenario,
      API_HOST: "127.0.0.1",
      API_PORT: "3822",
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_DB: "stock42_existing",
      AUTH_ACCESS_SECRET: createSecret(),
      AUTH_REFRESH_SECRET: createSecret(),
      CSRF_SECRET: createSecret(),
      WEBSOCKET_TICKET_SECRET: createSecret(),
      CORS_ORIGINS: corsOrigins,
      COOKIE_SECURE: scenario === "production" ? "true" : "false",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      AGENT_INTERNAL_URL: "http://127.0.0.1:4100",
      AGENT_SERVICE_TOKEN: agentServiceToken,
      RATE_LIMIT_ENABLED: "true",
      RATE_LIMIT_WINDOW_SECONDS: "60",
      RATE_LIMIT_REQUESTS: "120",
      RATE_LIMIT_LOGIN_REQUESTS: "10",
      RATE_LIMIT_AGENT_REQUESTS: "20",
      API_TEST_ENABLED: scenario === "test" ? "true" : "false",
      API_TEST_SEEDS: "false",
      TEST_TENANT_ID: "",
    },
    agent: {
      NODE_ENV: scenario,
      AGENT_HOST: "127.0.0.1",
      AGENT_PORT: "4100",
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_DB: "stock42_existing",
      AGENT_SERVICE_TOKEN: agentServiceToken,
      DEEPSEEK_API_KEY: "replace-with-provider-key",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_MODEL: "deepseek-v4-pro",
      DEEPSEEK_REASONING_EFFORT: "high",
      AGENT_LAUNCH_INTERVAL_MS: "1000",
      AGENT_SUPERVISOR_INTERVAL_MS: "2000",
      AGENT_GLOBAL_CONCURRENCY: "4",
      AGENT_TENANT_CONCURRENCY: "2",
      AGENT_HEARTBEAT_MS: "5000",
      AGENT_INACTIVITY_TIMEOUT_MS: "120000",
      AGENT_RUN_TIMEOUT_MS: "900000",
      AGENT_CANCEL_GRACE_MS: "10000",
      UPLOAD_STORAGE_PATH: "./uploads",
      ARTIFACT_STORAGE_PATH: "./artifacts",
      MAX_UPLOAD_BYTES: "10485760",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_API_BASE_URL: "https://api.telegram.org",
      TELEGRAM_POLL_TIMEOUT_SECONDS: "25",
      TELEGRAM_POLL_BACKOFF_MIN_MS: "1000",
      TELEGRAM_POLL_BACKOFF_MAX_MS: "30000",
      TELEGRAM_DELIVERY_INTERVAL_MS: "1000",
      TELEGRAM_POLLING_ENABLED: scenario === "production" ? "true" : "false",
    },
    webapp: {
      WEBAPP_PORT: "3820",
      API_INTERNAL_URL: "http://127.0.0.1:3822",
    },
    backoffice: {
      BACKOFFICE_PORT: "3821",
      API_INTERNAL_URL: "http://127.0.0.1:3822",
    },
  };
}

function decodeEnvValue(rawValue: string): string {
  const value = rawValue.trim();
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (!value.startsWith('"') || !value.endsWith('"')) {
    return value.replace(/\s+#.*$/, "").trimEnd();
  }

  const body = value.slice(1, -1);
  let decoded = "";
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== "\\") {
      decoded += body[index];
      continue;
    }
    const escaped = body[(index += 1)];
    if (escaped === "n") decoded += "\n";
    else if (escaped === "r") decoded += "\r";
    else if (escaped === "t") decoded += "\t";
    else if (escaped !== undefined) decoded += escaped;
  }
  return decoded;
}

export function parseEnvValues(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = decodeEnvValue(match[2]);
  }
  return values;
}

export function encodeEnvValue(value: string): string {
  if (value === "") return "";
  if (/^[A-Za-z0-9_./:@,+*?%=-]+$/.test(value)) return value;
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;

  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll('"', '\\"')
    .replaceAll("$", "\\$")}"`;
}

export function renderEnv(source: string, values: Record<string, string>): string {
  const rendered: string[] = [];
  const written = new Set<string>();

  for (const line of source.replaceAll("\r\n", "\n").split("\n")) {
    const match = line.match(/^(\s*(?:export\s+)?)([A-Z][A-Z0-9_]*)(\s*=\s*).*$/);
    const key = match?.[2];
    if (!key || values[key] === undefined) {
      rendered.push(line);
      continue;
    }
    rendered.push(`${match[1]}${key}=${encodeEnvValue(values[key])}`);
    written.add(key);
  }

  const missing = Object.entries(values).filter(([key]) => !written.has(key));
  while (rendered.at(-1) === "") rendered.pop();
  if (missing.length > 0) {
    if (rendered.length > 0) rendered.push("");
    rendered.push("# Agregado por bun run update:env");
    for (const [key, value] of missing) rendered.push(`${key}=${encodeEnvValue(value)}`);
  }
  return `${rendered.join("\n")}\n`;
}

function cloneValues(values: AppEnvValues): AppEnvValues {
  return Object.fromEntries(APP_NAMES.map((app) => [app, { ...values[app] }])) as AppEnvValues;
}

function detectExistingScenario(
  existing: Record<AppName, Record<string, string>>,
): Scenario | undefined {
  const candidates = [existing.api.NODE_ENV, existing.agent.NODE_ENV].filter(
    (value): value is Scenario => SCENARIOS.includes(value as Scenario),
  );
  return candidates.length > 0 && candidates.every((value) => value === candidates[0])
    ? candidates[0]
    : undefined;
}

function firstExistingValue(
  existing: Record<AppName, Record<string, string>>,
  target: PromptTarget,
): string | undefined {
  return target.apps
    .map((app) => existing[app][target.key])
    .find((value) => value !== undefined && value !== "");
}

export function applyExistingValues(
  defaults: AppEnvValues,
  existing: Record<AppName, Record<string, string>>,
  scenario: Scenario,
): AppEnvValues {
  const values = cloneValues(defaults);
  const keepScenarioValues = detectExistingScenario(existing) === scenario;

  for (const app of APP_NAMES) {
    for (const key of Object.keys(values[app])) {
      const current = existing[app][key];
      if (
        current !== undefined &&
        (current !== "" || values[app][key] === "") &&
        key !== "NODE_ENV" &&
        (keepScenarioValues || !scenarioControlledKeys.has(key))
      ) {
        values[app][key] = current;
      }
    }
  }

  for (const target of sharedTargets) {
    const sharedValue = firstExistingValue(existing, target) ?? values[target.apps[0]][target.key];
    for (const app of target.apps) values[app][target.key] = sharedValue;
  }
  values.api.NODE_ENV = scenario;
  values.agent.NODE_ENV = scenario;
  return values;
}

export function promptSections(values: AppEnvValues) {
  const shared = new Set(
    sharedTargets.flatMap((target) => target.apps.map((app) => `${app}:${target.key}`)),
  );
  const targetsFor = (app: AppName): PromptTarget[] =>
    Object.keys(values[app])
      .filter((key) => key !== "NODE_ENV" && !shared.has(`${app}:${key}`))
      .map((key) => ({ apps: [app], key }));

  return [
    { title: "Configuración compartida", targets: sharedTargets },
    { title: "API", targets: targetsFor("api") },
    { title: "Agente", targets: targetsFor("agent") },
    { title: "Webapp", targets: targetsFor("webapp") },
    { title: "Backoffice", targets: targetsFor("backoffice") },
  ] as const;
}

function validationError(key: string, value: string, values: AppEnvValues): string | undefined {
  if (value === "") return optionalKeys.has(key) ? undefined : "No puede quedar vacío.";
  if (longSecretKeys.has(key) && value.length < 32) return "Debe tener al menos 32 caracteres.";
  if (booleanKeys.has(key) && value !== "true" && value !== "false") {
    return "Usá true o false.";
  }
  if (integerKeys.has(key)) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) return "Ingresá un entero positivo.";
    if (key.endsWith("_PORT") && number > 65_535) {
      return "El puerto debe estar entre 1 y 65535.";
    }
    if (key === "TELEGRAM_POLL_TIMEOUT_SECONDS" && number > 50) {
      return "El timeout de Telegram no puede superar 50 segundos.";
    }
  }
  if (key === "MONGODB_URI" && !/^mongodb(?:\+srv)?:\/\//.test(value)) {
    return "Usá una URI mongodb:// o mongodb+srv://.";
  }
  if (httpUrlKeys.has(key)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      return "Ingresá una URL HTTP o HTTPS válida.";
    }
  }
  if (key === "DEEPSEEK_MODEL" && value !== "deepseek-v4-pro") {
    return "El modelo permitido es deepseek-v4-pro.";
  }
  if (key === "DEEPSEEK_REASONING_EFFORT" && value !== "high" && value !== "max") {
    return "Usá high o max.";
  }
  if (
    key === "TEST_TENANT_ID" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    return "Ingresá un UUID válido o dejalo vacío.";
  }
  if (
    key === "TELEGRAM_POLL_BACKOFF_MAX_MS" &&
    Number(value) < Number(values.agent.TELEGRAM_POLL_BACKOFF_MIN_MS)
  ) {
    return "No puede ser menor que TELEGRAM_POLL_BACKOFF_MIN_MS.";
  }
  return undefined;
}

class PromptOutput extends Writable {
  muted = false;

  override _write(
    chunk: string | Uint8Array,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  }
}

class PromptSession {
  private readonly output = new PromptOutput();
  private readonly readline = createInterface({
    input: process.stdin,
    output: this.output,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });

  async ask(
    key: string,
    defaultValue: string,
    options: {
      secret?: boolean;
      defaultHint?: string;
      validate?: (value: string) => string | undefined;
    } = {},
  ): Promise<string> {
    while (true) {
      const hint = options.defaultHint ?? (defaultValue === "" ? "vacío" : defaultValue);
      let answer: string;
      if (options.secret) {
        process.stdout.write(`${key} [${hint}]: `);
        this.output.muted = true;
        try {
          answer = await this.readline.question("");
        } finally {
          this.output.muted = false;
          process.stdout.write("\n");
        }
      } else {
        answer = await this.readline.question(`${key} [${hint}]: `);
      }

      const value = answer.trim() === "" ? defaultValue : answer.trim();
      const error = options.validate?.(value);
      if (!error) return value;
      console.error(`  ${error}`);
    }
  }

  close(): void {
    this.readline.close();
  }
}

function normalizeChoice(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

async function askScenario(prompt: PromptSession, defaultScenario: Scenario): Promise<Scenario> {
  console.info("\nEscenario:");
  SCENARIOS.forEach((scenario, index) => {
    console.info(`  ${index + 1}. ${scenarioLabels[scenario]} (${scenario})`);
  });
  const defaultChoice = String(SCENARIOS.indexOf(defaultScenario) + 1);
  const answer = await prompt.ask("Elegí un escenario", defaultChoice, {
    validate: (value) =>
      SCENARIOS.some(
        (scenario, index) =>
          normalizeChoice(value) === String(index + 1) ||
          normalizeChoice(value) === normalizeChoice(scenario),
      )
        ? undefined
        : "Elegí 1, 2, 3 o el nombre del escenario.",
  });
  return (
    SCENARIOS.find(
      (scenario, index) =>
        normalizeChoice(answer) === String(index + 1) ||
        normalizeChoice(answer) === normalizeChoice(scenario),
    ) ?? defaultScenario
  );
}

function hasExistingValue(
  existing: Record<AppName, Record<string, string>>,
  target: PromptTarget,
): boolean {
  return target.apps.some((app) => {
    const value = existing[app][target.key];
    return value !== undefined && value !== "";
  });
}

function secretHint(
  target: PromptTarget,
  defaultValue: string,
  existing: Record<AppName, Record<string, string>>,
): string {
  if (hasExistingValue(existing, target)) return "mantener actual";
  if (generatedSecretKeys.has(target.key)) return "generar automáticamente";
  if (target.key === "DEEPSEEK_API_KEY") return "reemplazar luego";
  return defaultValue === "" ? "vacío" : defaultValue;
}

async function collectValues(
  prompt: PromptSession,
  values: AppEnvValues,
  existing: Record<AppName, Record<string, string>>,
): Promise<void> {
  for (const section of promptSections(values)) {
    console.info(`\n${section.title}`);
    for (const target of section.targets) {
      const defaultValue = values[target.apps[0]][target.key] ?? "";
      const selected = await prompt.ask(target.key, defaultValue, {
        secret: secretKeys.has(target.key),
        defaultHint: secretKeys.has(target.key)
          ? secretHint(target, defaultValue, existing)
          : undefined,
        validate: (value) => validationError(target.key, value, values),
      });
      for (const app of target.apps) values[app][target.key] = selected;
    }
  }
}

async function readAppEnvironment(app: AppName): Promise<AppEnvironment> {
  const path = resolve(REPOSITORY_ROOT, "apps", app, ".env");
  const file = Bun.file(path);
  const source = (await file.exists()) ? await file.text() : undefined;
  return { path, source, values: source === undefined ? {} : parseEnvValues(source) };
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await Bun.write(temporaryPath, contents);
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function warnings(values: AppEnvValues, scenario: Scenario): string[] {
  return [
    values.agent.DEEPSEEK_API_KEY === "replace-with-provider-key"
      ? "DEEPSEEK_API_KEY conserva el placeholder y debe reemplazarse antes de iniciar."
      : undefined,
    scenario === "test" && values.api.TEST_TENANT_ID === ""
      ? "TEST_TENANT_ID sigue vacío; los tests requieren un tenant existente."
      : undefined,
    scenario === "production" &&
    values.agent.TELEGRAM_POLLING_ENABLED === "true" &&
    values.agent.TELEGRAM_BOT_TOKEN === ""
      ? "Telegram quedó habilitado sin TELEGRAM_BOT_TOKEN."
      : undefined,
    scenario === "production" && values.api.CORS_ORIGINS.includes("example.com")
      ? "CORS_ORIGINS conserva los dominios example.com del scaffold."
      : undefined,
  ].filter((warning): warning is string => warning !== undefined);
}

async function run(): Promise<void> {
  const states = await Promise.all(APP_NAMES.map(readAppEnvironment));
  const existing = Object.fromEntries(
    states.map((state, index) => [APP_NAMES[index], state.values]),
  ) as Record<AppName, Record<string, string>>;
  const prompt = new PromptSession();

  console.info("Configuración interactiva de entornos Stock42");
  console.info("Enter acepta el valor indicado. Los secretos ingresados no se muestran.");

  try {
    const scenario = await askScenario(prompt, detectExistingScenario(existing) ?? "development");
    const values = applyExistingValues(buildScenarioDefaults(scenario), existing, scenario);
    await collectValues(prompt, values, existing);

    console.info("\nSe crearán o actualizarán estos archivos:");
    for (const state of states) {
      console.info(`  ${state.path.replace(`${REPOSITORY_ROOT}/`, "")}`);
    }
    const confirmation = await prompt.ask("¿Guardar la configuración?", "sí", {
      validate: (value) =>
        ["si", "s", "yes", "y", "no", "n"].includes(normalizeChoice(value))
          ? undefined
          : "Respondé sí o no.",
    });
    if (["no", "n"].includes(normalizeChoice(confirmation))) {
      console.info("No se modificó ningún archivo.");
      return;
    }

    for (const [index, state] of states.entries()) {
      const app = APP_NAMES[index];
      const template = await Bun.file(resolve(REPOSITORY_ROOT, "apps", app, ".env.example")).text();
      await writePrivateFile(state.path, renderEnv(state.source ?? template, values[app]));
    }

    console.info(`\nConfiguración ${scenarioLabels[scenario].toLowerCase()} guardada.`);
    console.info("Los cuatro archivos .env quedaron con permisos 0600.");
    const pending = warnings(values, scenario);
    if (pending.length > 0) {
      console.info("\nPendientes:");
      for (const warning of pending) console.info(`  - ${warning}`);
    }
  } finally {
    prompt.close();
  }
}

if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    console.error(
      `No se pudo actualizar la configuración: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}

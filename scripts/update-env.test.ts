import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadAgentConfig } from "../apps/agent/src/config";
import { loadConfig } from "../apps/api/src/config";
import {
  APP_NAMES,
  applyExistingValues,
  buildScenarioDefaults,
  encodeEnvValue,
  parseEnvValues,
  promptSections,
  renderEnv,
  validateGeneratedConfiguration,
  type AppEnvValues,
} from "./update-env";

function existingValues(overrides: Partial<AppEnvValues> = {}): AppEnvValues {
  return {
    api: overrides.api ?? {},
    agent: overrides.agent ?? {},
    webapp: overrides.webapp ?? {},
    backoffice: overrides.backoffice ?? {},
  };
}

describe("update:env", () => {
  test("aplica defaults seguros por escenario y sincroniza valores compartidos", () => {
    let secretIndex = 0;
    const production = buildScenarioDefaults("production", () => `secret-${++secretIndex}`);
    const testEnvironment = buildScenarioDefaults("test", () => `secret-${++secretIndex}`);

    expect(production.api.COOKIE_SECURE).toBe("true");
    expect(production.api.CORS_ORIGINS).toBe("https://example.com,https://backoffice.example.com");
    expect(production.agent.TELEGRAM_POLLING_ENABLED).toBe("true");
    expect(production.api.AGENT_SERVICE_TOKEN).toBe(production.agent.AGENT_SERVICE_TOKEN);
    expect(testEnvironment.api.API_TEST_ENABLED).toBe("true");
    expect(testEnvironment.api.COOKIE_SECURE).toBe("false");
    expect(testEnvironment.agent.TELEGRAM_POLLING_ENABLED).toBe("false");
  });

  test("genera valores aceptados por los contratos de API y agente", () => {
    for (const scenario of ["development", "test", "production"] as const) {
      let secretIndex = 0;
      const values = buildScenarioDefaults(
        scenario,
        () => `${String(++secretIndex).padStart(2, "0")}${"x".repeat(32)}`,
      );
      values.api.DEFAULT_ADMIN_BOOTSTRAP_ENABLED = "true";
      values.api.DEFAULT_ADMIN_EMAIL = "ADMIN@EXAMPLE.COM";
      values.api.DEFAULT_ADMIN_PASSWORD = "a-secure-password";
      if (scenario === "production") values.api.CORS_ORIGINS = "https://app.acme.test";
      if (scenario === "production") {
        values.api.WEBSOCKET_PUBLIC_URL = "wss://api.acme.test/ws";
      }
      values.agent.DEEPSEEK_API_KEY = "provider-live-key-for-production-tests";
      expect(loadConfig(values.api).defaultAdministrator.email).toBe("admin@example.com");
      expect(() => loadAgentConfig(values.agent)).not.toThrow();
    }
  });

  test("requiere credenciales explícitas para el administrador inicial", () => {
    const values = buildScenarioDefaults("development", () => "x".repeat(32));

    expect(values.api.DEFAULT_ADMIN_EMAIL).toBe("");
    expect(values.api.DEFAULT_ADMIN_PASSWORD).toBe("");
    expect(values.api.DEFAULT_ADMIN_BOOTSTRAP_ENABLED).toBe("false");
    expect(loadConfig(values.api).defaultAdministrator).toBeNull();

    values.api.DEFAULT_ADMIN_BOOTSTRAP_ENABLED = "true";
    expect(() => loadConfig(values.api)).toThrow(/DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD/);
  });

  test("falla cerrado ante defaults inseguros de producción", () => {
    let secretIndex = 0;
    const values = buildScenarioDefaults(
      "production",
      () => `${String(++secretIndex).padStart(2, "0")}${"z".repeat(32)}`,
    );
    values.api.CORS_ORIGINS = "*";
    values.api.COOKIE_SECURE = "false";
    values.api.WEBSOCKET_PUBLIC_URL = "ws://127.0.0.1:3822/ws";
    values.agent.AGENT_HOST = "0.0.0.0";
    values.agent.DEEPSEEK_API_KEY = "replace-with-provider-key";

    expect(() => loadConfig(values.api)).toThrow(
      /CORS_ORIGINS, COOKIE_SECURE, WEBSOCKET_PUBLIC_URL/,
    );
    expect(() => loadAgentConfig(values.agent)).toThrow(/AGENT_HOST, DEEPSEEK_API_KEY/);
    expect(() => validateGeneratedConfiguration(values)).toThrow();
  });

  test("preserva valores existentes sin arrastrar defaults inseguros entre escenarios", () => {
    const defaults = buildScenarioDefaults("production", () => "generated-secret");
    const merged = applyExistingValues(
      defaults,
      existingValues({
        api: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://database.internal:27017",
          AGENT_SERVICE_TOKEN: "existing-service-token-with-more-than-32-characters",
          CORS_ORIGINS: "*",
          COOKIE_SECURE: "false",
        },
        agent: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://database.internal:27017",
          AGENT_SERVICE_TOKEN: "different-existing-token-with-more-than-32-characters",
          DEEPSEEK_API_KEY: "existing-provider-key",
          DEEPSEEK_BASE_URL: "",
        },
        webapp: {
          WEBAPP_PORT: "4920",
          API_INTERNAL_URL: "http://api.internal:4388",
        },
        backoffice: { BACKOFFICE_PORT: "4921" },
      }),
      "production",
    );

    expect(merged.api.MONGODB_URI).toBe("mongodb://database.internal:27017");
    expect(merged.agent.MONGODB_URI).toBe("mongodb://database.internal:27017");
    expect(merged.api.AGENT_SERVICE_TOKEN).toBe(merged.agent.AGENT_SERVICE_TOKEN);
    expect(merged.agent.DEEPSEEK_API_KEY).toBe("existing-provider-key");
    expect(merged.agent.DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
    expect(merged.api.CORS_ORIGINS).not.toBe("*");
    expect(merged.api.COOKIE_SECURE).toBe("true");
    expect(merged.webapp.WEBAPP_PORT).toBe("4920");
    expect(merged.backoffice.BACKOFFICE_PORT).toBe("4921");
    expect(merged.webapp.API_INTERNAL_URL).toBe("http://api.internal:4388");
    expect(merged.backoffice.API_INTERNAL_URL).toBe("http://api.internal:4388");
  });

  test("actualiza claves administradas y conserva contenido adicional", () => {
    const source = ["# Configuración propia", "API_HOST=0.0.0.0", "CUSTOM_VALUE=keep-me", ""].join(
      "\n",
    );
    const rendered = renderEnv(source, {
      API_HOST: "127.0.0.1",
      CORS_ORIGINS: "https://app.example.com, https://admin.example.com",
    });

    expect(rendered).toContain("# Configuración propia");
    expect(rendered).toContain("API_HOST=127.0.0.1");
    expect(rendered).toContain("CUSTOM_VALUE=keep-me");
    expect(rendered).toContain("CORS_ORIGINS='https://app.example.com, https://admin.example.com'");
    expect(parseEnvValues(rendered).CORS_ORIGINS).toBe(
      "https://app.example.com, https://admin.example.com",
    );
  });

  test("serializa valores especiales sin permitir nuevas asignaciones", () => {
    const value = `secret with spaces, $variable and 'quote'\nINJECTED=value`;
    const encoded = encodeEnvValue(value);
    expect(parseEnvValues(`SECRET=${encoded}\n`).SECRET).toBe(value);
    expect(encoded.split("\n")).toHaveLength(1);
  });

  test("mantiene alineados templates, defaults y preguntas", async () => {
    const defaults = buildScenarioDefaults("development", () => "generated-secret");
    const promptedByApp = Object.fromEntries(
      APP_NAMES.map((app) => [app, new Set(app === "api" || app === "agent" ? ["NODE_ENV"] : [])]),
    ) as Record<(typeof APP_NAMES)[number], Set<string>>;

    for (const section of promptSections(defaults)) {
      for (const target of section.targets) {
        for (const app of target.apps) promptedByApp[app].add(target.key);
      }
    }

    for (const app of APP_NAMES) {
      const template = await Bun.file(
        resolve(import.meta.dir, "..", "apps", app, ".env.example"),
      ).text();
      const templateKeys = Object.keys(parseEnvValues(template)).sort();
      expect(Object.keys(defaults[app]).sort()).toEqual(templateKeys);
      expect([...promptedByApp[app]].sort()).toEqual(templateKeys);
    }
  });

  test("mantiene alineados los puertos por defecto, scripts y Nginx", async () => {
    const defaults = buildScenarioDefaults("development", () => "x".repeat(32));
    defaults.api.DEFAULT_ADMIN_EMAIL = "admin@example.com";
    defaults.api.DEFAULT_ADMIN_PASSWORD = "a-secure-password";
    const apiWithoutPort = { ...defaults.api };
    delete apiWithoutPort.API_PORT;

    expect(loadConfig(apiWithoutPort).port).toBe(3822);
    expect(defaults.api.API_PORT).toBe("3822");
    expect(defaults.webapp.WEBAPP_PORT).toBe("3820");
    expect(defaults.backoffice.BACKOFFICE_PORT).toBe("3821");
    expect(defaults.webapp.API_INTERNAL_URL).toBe("http://127.0.0.1:3822");
    expect(defaults.backoffice.API_INTERNAL_URL).toBe("http://127.0.0.1:3822");

    const webappManifest = await Bun.file(
      resolve(import.meta.dir, "..", "apps", "webapp", "package.json"),
    ).json();
    const backofficeManifest = await Bun.file(
      resolve(import.meta.dir, "..", "apps", "backoffice", "package.json"),
    ).json();
    expect(webappManifest.scripts.dev).toContain("${WEBAPP_PORT:-3820}");
    expect(webappManifest.scripts.start).toContain("${WEBAPP_PORT:-3820}");
    expect(backofficeManifest.scripts.dev).toContain("${BACKOFFICE_PORT:-3821}");
    expect(backofficeManifest.scripts.start).toContain("${BACKOFFICE_PORT:-3821}");

    const webappNginx = await Bun.file(
      resolve(import.meta.dir, "..", "nginx", "example.com"),
    ).text();
    const backofficeNginx = await Bun.file(
      resolve(import.meta.dir, "..", "nginx", "backoffice.example.com"),
    ).text();
    const apiNginx = await Bun.file(
      resolve(import.meta.dir, "..", "nginx", "api.example.com"),
    ).text();
    expect(webappNginx).toContain("proxy_pass http://127.0.0.1:3820");
    expect(backofficeNginx).toContain("proxy_pass http://127.0.0.1:3821");
    expect(apiNginx).toContain("proxy_pass http://127.0.0.1:3822");
  });
});

import { describe, expect, test } from "bun:test";
import { loadConfig } from "@/config";
import {
  renderEmailTemplate,
  resolveCampaignTerminalStatus,
} from "@/modules/email-marketing/services/EmailMarketingService";

function environment(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "development",
    MONGODB_URI: "mongodb://127.0.0.1:27017",
    MONGODB_DB: "existing_database",
    AUTH_ACCESS_SECRET: "a".repeat(32),
    AUTH_REFRESH_SECRET: "b".repeat(32),
    CSRF_SECRET: "c".repeat(32),
    WEBSOCKET_TICKET_SECRET: "d".repeat(32),
    AGENT_SERVICE_TOKEN: "e".repeat(32),
    ...overrides,
  };
}

describe("email marketing", () => {
  test("escapes user values in HTML while preserving template markup", () => {
    const rendered = renderEmailTemplate(
      "<p>Hola {{displayName}} ({{user.email}})</p>",
      { displayName: '<script>alert("x")</script>', email: "user@example.com" },
      true,
    );

    expect(rendered).toBe(
      "<p>Hola &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; (user@example.com)</p>",
    );
  });

  test("keeps delivery disabled without SMTP credentials", () => {
    const config = loadConfig(environment());
    expect(config.email.enabled).toBe(false);
    expect(config.email.configured).toBe(false);
  });

  test("requires complete SMTP credentials when the spooler is enabled", () => {
    expect(() => loadConfig(environment({ EMAIL_SPOOLER_ENABLED: "true" }))).toThrow(
      /SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM/,
    );

    const config = loadConfig(
      environment({
        EMAIL_SPOOLER_ENABLED: "true",
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "mailer",
        SMTP_PASS: "secret",
        MAIL_FROM: "news@example.com",
      }),
    );
    expect(config.email.enabled).toBe(true);
    expect(config.email.configured).toBe(true);
    expect(config.email.from).toBe("news@example.com");
  });

  test("preserves a stopped campaign when an in-flight email finishes", () => {
    expect(
      resolveCampaignTerminalStatus("stopped", {
        pending: 0,
        processing: 0,
        sent: 1,
        failed: 0,
        stopped: 4,
        total: 5,
      }),
    ).toBeNull();
  });
});

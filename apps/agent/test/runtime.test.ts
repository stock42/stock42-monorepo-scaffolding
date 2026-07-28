import { describe, expect, test } from "bun:test";
import { loadAgentConfig } from "@/config";
import { startInternalServer } from "@/http/server";
import { createAssistantManifest } from "@/runtime/contracts/manifest";
import type { AgentStore } from "@/runtime/store/AgentStore";
import { TelegramApiError, TelegramClient } from "@/telegram/TelegramClient";
import { ToolRegistry } from "@/tools/registry/ToolRegistry";

function testConfig(overrides: Record<string, string | undefined> = {}) {
  return loadAgentConfig({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017",
    MONGODB_DB: "existing_test_database",
    AGENT_SERVICE_TOKEN: "s".repeat(32),
    DEEPSEEK_API_KEY: "test-provider-key",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
    DEEPSEEK_REASONING_EFFORT: "high",
    ...overrides,
  });
}

describe("durable agent baseline", () => {
  test("pins DeepSeek V4 Pro and reasoning", () => {
    const config = testConfig();
    expect(config.deepseek.model).toBe("deepseek-v4-pro");
    expect(config.deepseek.reasoningEffort).toBe("high");
  });

  test("declares process, heartbeat, cancellation and concurrency policy", () => {
    const manifest = createAssistantManifest(testConfig());
    expect(manifest.kind).toBe("subagent");
    expect(manifest.heartbeatMs).toBeGreaterThan(0);
    expect(manifest.cancelGraceMs).toBeGreaterThan(0);
    expect(manifest.concurrency.global).toBeGreaterThan(0);
    expect(manifest.actionLevel).toBe("A3");
  });

  test("has bounded domain tools and no generic MongoDB tools", () => {
    const registry = new ToolRegistry(testConfig(), {} as AgentStore);
    const tools = registry.list();
    expect(tools.some((tool) => tool.actionClass === "read")).toBe(true);
    expect(tools.some((tool) => tool.actionClass === "write")).toBe(true);
    expect(tools.some((tool) => tool.actionClass === "critical")).toBe(true);
    expect(tools.map((tool) => tool.name)).not.toContain("mongodb_find");
    expect(tools.map((tool) => tool.name)).not.toContain("mongodb_aggregate");
  });

  test("keeps Telegram polling disabled unless explicitly enabled", () => {
    expect(testConfig().telegram.pollingEnabled).toBe(false);
    expect(testConfig({ TELEGRAM_POLLING_ENABLED: "true" }).telegram.pollingEnabled).toBe(true);
  });

  test("separates local and production Telegram polling scripts", async () => {
    const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json();
    expect(manifest.scripts.dev).toBe(
      "TELEGRAM_POLLING_ENABLED=false bun --hot src/entrypoints/all.ts",
    );
    expect(manifest.scripts["dev:telegram"]).toBe(
      "TELEGRAM_POLLING_ENABLED=true bun --hot src/entrypoints/all.ts",
    );
    expect(manifest.scripts.start).toBe(
      "TELEGRAM_POLLING_ENABLED=true bun run src/entrypoints/all.ts",
    );
  });

  test("reports Telegram disabled without degrading local HTTP health", async () => {
    const config = { ...testConfig(), port: 0 };
    const store = {
      telegramRuntimeStatus: async () => null,
    } as unknown as AgentStore;
    const server = startInternalServer(config, store, new ToolRegistry(config, store));
    try {
      const response = await fetch(new URL("/internal/health/live", server.url));
      const payload = (await response.json()) as {
        data: {
          status: string;
          telegram: { enabled: boolean; state: string; running: boolean };
        };
      };
      expect(response.status).toBe(200);
      expect(payload.data.status).toBe("ok");
      expect(payload.data.telegram).toEqual({
        enabled: false,
        state: "disabled",
        running: false,
      });
    } finally {
      await server.stop(true);
    }
  });

  test("calls getUpdates with a durable offset and bounded long polling", async () => {
    let requestBody: Record<string, unknown> = {};
    const client = new TelegramClient(testConfig({ TELEGRAM_BOT_TOKEN: "test-token" }), (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        ok: true,
        result: [
          {
            update_id: 41,
            message: {
              message_id: 7,
              date: 1_700_000_000,
              text: "hola",
              from: { id: 123, is_bot: false },
              chat: { id: 123, type: "private" },
            },
          },
        ],
      });
    }) as unknown as typeof fetch);

    const updates = await client.getUpdates({ offset: 41, timeoutSeconds: 25 });
    expect(updates[0]?.update_id).toBe(41);
    expect(requestBody).toEqual({
      offset: 41,
      limit: 100,
      timeout: 25,
      allowed_updates: ["message"],
    });
  });

  test("surfaces Telegram 409 without exposing the bot URL", async () => {
    const client = new TelegramClient(testConfig({ TELEGRAM_BOT_TOKEN: "test-token" }), (async () =>
      Response.json(
        {
          ok: false,
          error_code: 409,
          description: "Conflict for test-token: terminated by other getUpdates request",
        },
        { status: 409 },
      )) as unknown as typeof fetch);

    try {
      await client.getUpdates({ offset: 0, timeoutSeconds: 25 });
      throw new Error("Se esperaba TelegramApiError.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(TelegramApiError);
      expect((cause as TelegramApiError).code).toBe(409);
      expect((cause as Error).message).not.toContain("test-token");
    }
  });
});

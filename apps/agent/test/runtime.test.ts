import { describe, expect, test } from "bun:test";
import { loadAgentConfig } from "@/config";
import { startInternalServer } from "@/http/server";
import { createAssistantManifest } from "@/runtime/contracts/manifest";
import { canAccessOwnedResource, ownerFilter } from "@/runtime/authorization";
import type { AgentStore } from "@/runtime/store/AgentStore";
import { commandArgumentsMatchRun } from "@/runtime/supervisor/Supervisor";
import { TelegramApiError, TelegramClient } from "@/telegram/TelegramClient";
import { TelegramPollingRuntime } from "@/telegram/TelegramPollingRuntime";
import { csvCell, ToolRegistry } from "@/tools/registry/ToolRegistry";

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

  test("matches the OS process command to the claimed run and process", () => {
    const runId = "10000000-0000-4000-8000-000000000001";
    const processId = "10000000-0000-4000-8000-000000000002";
    expect(
      commandArgumentsMatchRun(
        ["bun", "process.ts", "--run-id", runId, "--process-id", processId],
        runId,
        processId,
      ),
    ).toBe(true);
    expect(
      commandArgumentsMatchRun(
        ["bun", "process.ts", "--run-id", runId, "--process-id", "other"],
        runId,
        processId,
      ),
    ).toBe(false);
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

  test("enforces the published actor ownership matrix", () => {
    const ownerId = "10000000-0000-4000-8000-000000000001";
    const otherActorId = "10000000-0000-4000-8000-000000000002";
    expect(canAccessOwnedResource(ownerId, { actorId: ownerId, actorRole: "tenant_user" })).toBe(
      true,
    );
    expect(
      canAccessOwnedResource(ownerId, {
        actorId: otherActorId,
        actorRole: "tenant_operator",
      }),
    ).toBe(false);
    expect(
      canAccessOwnedResource(ownerId, { actorId: otherActorId, actorRole: "tenant_owner" }),
    ).toBe(true);
    expect(ownerFilter("actorId", { actorId: otherActorId, actorRole: "tenant_user" })).toEqual({
      actorId: otherActorId,
    });
    expect(ownerFilter("actorId", { actorId: otherActorId, actorRole: "platform_admin" })).toEqual(
      {},
    );
  });

  test("neutralizes spreadsheet formulas in exported CSV cells", () => {
    expect(csvCell('=WEBSERVICE("https://example.test")')).toBe(
      `"'=WEBSERVICE(""https://example.test"")"`,
    );
    expect(csvCell("  -2+3")).toBe(`"'  -2+3"`);
    expect(csvCell("ordinary value")).toBe(`"ordinary value"`);
  });

  test("requires a server-owned Telegram destination instead of a chat id", () => {
    const registry = new ToolRegistry(testConfig(), {} as AgentStore);
    const telegramTool = registry.get("send_telegram_message");
    const schema = telegramTool.inputSchema;
    expect(telegramTool.idempotent).toBe(false);
    expect(schema.safeParse({ chatId: "123", text: "hola" }).success).toBe(false);
    expect(
      schema.safeParse({
        destinationId: "10000000-0000-4000-8000-000000000001",
        text: "hola",
      }).success,
    ).toBe(true);
  });

  test("requires both the Telegram polling flag and bot token", () => {
    expect(testConfig().telegram.pollingEnabled).toBe(false);
    expect(testConfig({ TELEGRAM_POLLING_ENABLED: "true" }).telegram.pollingEnabled).toBe(false);
    expect(
      testConfig({
        TELEGRAM_POLLING_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "test-token",
      }).telegram.pollingEnabled,
    ).toBe(true);
  });

  test("stops Telegram without scheduling work when the token is absent", async () => {
    const statuses: Array<Record<string, unknown>> = [];
    const config = testConfig({ TELEGRAM_POLLING_ENABLED: "true" });
    const store = {
      setTelegramRuntimeStatus: async (status: Record<string, unknown>) => {
        statuses.push(status);
      },
    } as unknown as AgentStore;

    await new TelegramPollingRuntime(config, store).run();

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      enabled: false,
      state: "disabled",
      running: false,
      nextRetryAt: null,
    });
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
    const config = {
      ...testConfig({ TELEGRAM_POLLING_ENABLED: "true" }),
      port: 0,
    };
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

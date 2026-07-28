import { describe, expect, test } from "bun:test";
import { loadAgentConfig } from "@/config";
import { createAssistantManifest } from "@/runtime/contracts/manifest";
import type { AgentStore } from "@/runtime/store/AgentStore";
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
    expect(testConfig().telegramPollingEnabled).toBe(false);
    expect(testConfig({ TELEGRAM_POLLING_ENABLED: "true" }).telegramPollingEnabled).toBe(true);
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

  test("keeps the v0 Telegram integration outbound-only", async () => {
    const source = await Bun.file(
      new URL("../src/tools/telegram/TelegramService.ts", import.meta.url),
    ).text();
    expect(source).toContain("/sendMessage");
    expect(source).not.toContain("/getUpdates");
  });
});

import { describe, expect, test } from "bun:test";
import { loadAgentConfig } from "@/config";
import { createAssistantManifest } from "@/runtime/contracts/manifest";
import type { AgentStore } from "@/runtime/store/AgentStore";
import { ToolRegistry } from "@/tools/registry/ToolRegistry";

function testConfig() {
  return loadAgentConfig({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017",
    MONGODB_DB: "existing_test_database",
    AGENT_SERVICE_TOKEN: "s".repeat(32),
    DEEPSEEK_API_KEY: "test-provider-key",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
    DEEPSEEK_REASONING_EFFORT: "high",
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
});

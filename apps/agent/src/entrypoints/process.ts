import { parseArgs } from "node:util";
import { loadAgentConfig } from "@/config";
import { AgentOrchestrator } from "@/orchestration/AgentOrchestrator";
import { ManifestRegistry } from "@/runtime/contracts/manifest";
import { AgentStore } from "@/runtime/store/AgentStore";
import { ToolRegistry } from "@/tools/registry/ToolRegistry";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "run-id": { type: "string" },
    "process-id": { type: "string" },
  },
  strict: true,
});
const runId = values["run-id"];
const processId = values["process-id"];
if (!runId || !processId) throw new Error("--run-id y --process-id son obligatorios.");

const config = loadAgentConfig();
const store = new AgentStore(config);
await store.connect();
const processController = new AbortController();
const abortProcess = () => processController.abort(new Error("agent_process_terminated"));
process.once("SIGTERM", abortProcess);
process.once("SIGINT", abortProcess);

try {
  await store.markRunning(runId, processId, process.pid);
  const orchestrator = new AgentOrchestrator(
    config,
    store,
    new ManifestRegistry(config),
    new ToolRegistry(config, store),
  );
  await orchestrator.execute(runId, processId, processController.signal);
} catch (cause) {
  console.error("Agent run process failed", {
    runId,
    processId,
    error: cause instanceof Error ? cause.message : "unknown",
  });
  process.exitCode = 1;
} finally {
  process.removeListener("SIGTERM", abortProcess);
  process.removeListener("SIGINT", abortProcess);
  await store.close();
}

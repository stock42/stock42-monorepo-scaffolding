import { loadAgentConfig } from "@/config";
import { startInternalServer } from "@/http/server";
import { AgentStore } from "@/runtime/store/AgentStore";
import { ToolRegistry } from "@/tools/registry/ToolRegistry";

const config = loadAgentConfig();
const store = new AgentStore(config);
await store.connect();
await store.ensureIndexes();
const tools = new ToolRegistry(config, store);
const server = startInternalServer(config, store, tools);
console.info("Agent internal server ready", { url: server.url.toString() });

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.stop(true);
  await store.close();
}

process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

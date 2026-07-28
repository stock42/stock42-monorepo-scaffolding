import { loadAgentConfig } from "@/config";
import { AgentStore } from "@/runtime/store/AgentStore";
import { Supervisor } from "@/runtime/supervisor/Supervisor";

const config = loadAgentConfig();
const store = new AgentStore(config);
await store.connect();
await store.ensureIndexes();
const supervisor = new Supervisor(config, store);
supervisor.start();
console.info("Agent supervisor ready");

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  supervisor.stop();
  await store.close();
}

process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

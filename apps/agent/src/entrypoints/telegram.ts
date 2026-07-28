import { loadAgentConfig } from "@/config";
import { AgentStore } from "@/runtime/store/AgentStore";
import { TelegramPollingRuntime } from "@/telegram/TelegramPollingRuntime";

const config = loadAgentConfig();
const store = new AgentStore(config);
await store.connect();
await store.ensureIndexes();
const runtime = new TelegramPollingRuntime(config, store);
console.info("Telegram polling supervisor ready", {
  enabled: config.telegram.pollingEnabled,
});

const running = runtime.run();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  runtime.stop();
  await running;
  await store.close();
}

process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

await running;

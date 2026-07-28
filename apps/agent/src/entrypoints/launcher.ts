import { loadAgentConfig } from "@/config";
import { ManifestRegistry } from "@/runtime/contracts/manifest";
import { Launcher } from "@/runtime/launcher/Launcher";
import { AgentStore } from "@/runtime/store/AgentStore";

const config = loadAgentConfig();
const store = new AgentStore(config);
await store.connect();
await store.ensureIndexes();
const launcher = new Launcher(config, store, new ManifestRegistry(config));
launcher.start();
console.info("Agent launcher ready");

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await launcher.stop();
  await store.close();
}

process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

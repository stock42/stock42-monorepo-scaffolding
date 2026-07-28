import { fileURLToPath } from "node:url";
import { loadAgentConfig } from "@/config";

const config = loadAgentConfig();
const coreEntrypoints = ["server", "launcher", "supervisor"] as const;

function spawn(name: (typeof coreEntrypoints)[number] | "telegram") {
  return Bun.spawn(
    [process.execPath, "run", fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: Bun.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
}

const children = coreEntrypoints.map((name) => ({ name, child: spawn(name) }));
let telegramChild: ReturnType<typeof spawn> | null = null;

let closing = false;
async function close(signal: NodeJS.Signals = "SIGTERM") {
  if (closing) return;
  closing = true;
  for (const { child } of children) child.kill(signal);
  telegramChild?.kill(signal);
  await Promise.allSettled([
    ...children.map(({ child }) => child.exited),
    ...(telegramChild ? [telegramChild.exited] : []),
  ]);
}

process.once("SIGINT", () => void close("SIGINT").then(() => process.exit(0)));
process.once("SIGTERM", () => void close("SIGTERM").then(() => process.exit(0)));

async function superviseTelegram() {
  let backoffMs = config.telegram.backoffMinMs;
  while (!closing) {
    telegramChild = spawn("telegram");
    const code = await telegramChild.exited;
    telegramChild = null;
    if (closing) return;
    console.warn("Telegram entrypoint exited; HTTP remains available", {
      code,
      retryInMs: backoffMs,
    });
    await Bun.sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, config.telegram.backoffMaxMs);
  }
}

if (config.telegram.pollingEnabled) void superviseTelegram();

const exited = await Promise.race(
  children.map(async ({ name, child }) => ({ name, code: await child.exited })),
);
console.error("Agent entrypoint exited; stopping app", exited);
await close();
process.exit(exited.code === 0 ? 1 : exited.code);

import { fileURLToPath } from "node:url";

const entrypoints = ["server", "launcher", "supervisor"] as const;
const children = entrypoints.map((name) => ({
  name,
  child: Bun.spawn(
    [process.execPath, "run", fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: Bun.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  ),
}));

let closing = false;
async function close(signal: NodeJS.Signals = "SIGTERM") {
  if (closing) return;
  closing = true;
  for (const { child } of children) child.kill(signal);
  await Promise.allSettled(children.map(({ child }) => child.exited));
}

process.once("SIGINT", () => void close("SIGINT").then(() => process.exit(0)));
process.once("SIGTERM", () => void close("SIGTERM").then(() => process.exit(0)));

const exited = await Promise.race(
  children.map(async ({ name, child }) => ({ name, code: await child.exited })),
);
console.error("Agent entrypoint exited; stopping app", exited);
await close();
process.exit(exited.code === 0 ? 1 : exited.code);

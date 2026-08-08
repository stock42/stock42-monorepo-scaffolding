import { fileURLToPath } from "node:url";
import type { AgentConfig } from "@/config";
import type { ManifestRegistry } from "../contracts/manifest";
import type { ProcessDocument } from "../contracts/types";
import type { AgentStore } from "../store/AgentStore";

export class Launcher {
  private readonly launcherId = crypto.randomUUID();
  private readonly children = new Map<string, Bun.Subprocess>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private launching = false;

  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
    private readonly manifests: ManifestRegistry,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.config.runtime.launchIntervalMs);
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const child of this.children.values()) child.kill("SIGTERM");
    await Promise.allSettled([...this.children.values()].map((child) => child.exited));
  }

  private async tick(): Promise<void> {
    if (this.launching) return;
    this.launching = true;
    try {
      const processId = crypto.randomUUID();
      const run = await this.store.claimNext(this.launcherId, processId);
      if (!run) return;
      const manifest = this.manifests.get(run.manifest);
      const processPath = fileURLToPath(new URL("../../entrypoints/process.ts", import.meta.url));
      const environment: Record<string, string> = {};
      for (const key of manifest.envAllowlist) {
        const value = Bun.env[key];
        if (value !== undefined) environment[key] = value;
      }
      const child = Bun.spawn(
        [process.execPath, "run", processPath, "--run-id", run.uuid, "--process-id", processId],
        {
          cwd: fileURLToPath(new URL("../../../", import.meta.url)),
          env: environment,
          stdin: "ignore",
          stdout: "inherit",
          stderr: "inherit",
        },
      );
      const processDocument: ProcessDocument = {
        uuid: processId,
        runId: run.uuid,
        launcherId: this.launcherId,
        pid: child.pid,
        status: "starting",
        startedAt: new Date().toISOString(),
        exitedAt: null,
        exitCode: null,
      };
      await this.store.attachProcess(run.uuid, processDocument);
      this.children.set(processId, child);
      void this.collect(processId, run.uuid, child);
    } finally {
      this.launching = false;
    }
  }

  private async collect(processId: string, runId: string, child: Bun.Subprocess): Promise<void> {
    const exitCode = await child.exited;
    this.children.delete(processId);
    await this.store.markProcessExited(processId, exitCode);
    const run = await this.store.getRun(runId);
    if (!run || run.processId !== processId) return;
    if (run.status === "cancel_requested") {
      const forced = run.terminalReason === "cancel_grace_exceeded";
      await this.store.transition(
        runId,
        forced ? "killed" : "cancelled",
        { terminalReason: forced ? "cancel_grace_exceeded" : "cancelled_by_actor" },
        processId,
      );
      return;
    }
    if (run.status === "starting" || run.status === "running") {
      if (
        run.terminationRequestedAt &&
        (run.terminalReason === "deadline_exceeded" ||
          run.terminalReason === "heartbeat_stale" ||
          run.terminalReason?.endsWith(":sigkill"))
      ) {
        await this.store.transition(
          runId,
          "timed_out",
          { terminalReason: run.terminalReason },
          processId,
        );
        return;
      }
      const crashed = await this.store.transition(
        runId,
        "crashed",
        {
          terminalReason: `process_exit_${exitCode}`,
        },
        processId,
      );
      if (crashed.attempt <= crashed.retryLimit) {
        await this.store.transition(
          runId,
          "queued",
          {
            claimedBy: null,
            processId: null,
            pid: null,
            heartbeatAt: null,
            terminationRequestedAt: null,
          },
          processId,
        );
      }
    }
  }
}

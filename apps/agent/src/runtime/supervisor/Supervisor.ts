import type { AgentConfig } from "@/config";
import type { RunDocument } from "../contracts/types";
import type { AgentStore } from "../store/AgentStore";

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class Supervisor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.config.runtime.supervisorIntervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.store.expireConfirmations();
      for (const run of await this.store.supervisionCandidates()) {
        await this.inspect(run);
      }
    } finally {
      this.running = false;
    }
  }

  private async inspect(run: RunDocument): Promise<void> {
    const now = Date.now();
    const heartbeat = run.heartbeatAt ? Date.parse(run.heartbeatAt) : 0;
    const deadlineExceeded = Date.parse(run.deadlineAt) <= now;
    const inactive = heartbeat > 0 && now - heartbeat > this.config.runtime.inactivityTimeoutMs;

    if (run.pid && !processExists(run.pid)) {
      if (run.status === "cancel_requested") {
        await this.store.transition(run.uuid, "cancelled", {
          terminalReason: "cancelled_by_actor",
        });
      } else {
        await this.store.transition(run.uuid, "crashed", {
          terminalReason: "process_missing",
        });
      }
      return;
    }

    if (deadlineExceeded || inactive) {
      await this.stopForTimeout(run, deadlineExceeded ? "deadline_exceeded" : "heartbeat_stale");
      return;
    }
    if (run.status === "cancel_requested") await this.stopForCancellation(run);
  }

  private async stopForTimeout(run: RunDocument, reason: string): Promise<void> {
    if (run.pid) {
      try {
        process.kill(run.pid, "SIGTERM");
      } catch {
        // The terminal transition remains the source of truth.
      }
    }
    await this.store.transition(run.uuid, "timed_out", { terminalReason: reason });
  }

  private async stopForCancellation(run: RunDocument): Promise<void> {
    if (!run.pid) {
      await this.store.transition(run.uuid, "cancelled", {
        terminalReason: "cancelled_before_process",
      });
      return;
    }
    if (!run.terminationRequestedAt) {
      try {
        process.kill(run.pid, "SIGTERM");
      } catch {
        await this.store.transition(run.uuid, "cancelled", {
          terminalReason: "cancelled_process_missing",
        });
        return;
      }
      await this.store.noteTerminationRequested(run.uuid, "cancel_requested");
      return;
    }
    if (Date.now() - Date.parse(run.terminationRequestedAt) > this.config.runtime.cancelGraceMs) {
      try {
        process.kill(run.pid, "SIGKILL");
      } catch {
        // Process already exited.
      }
      await this.store.transition(run.uuid, "killed", {
        terminalReason: "cancel_grace_exceeded",
      });
    }
  }
}

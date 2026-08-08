import type { AgentConfig } from "@/config";
import { readFile } from "node:fs/promises";
import type { RunDocument } from "../contracts/types";
import { AgentAttemptInactiveError, type AgentStore } from "../store/AgentStore";

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function commandArgumentsMatchRun(
  command: string[],
  runId: string,
  processId: string,
): boolean {
  const runFlag = command.indexOf("--run-id");
  const processFlag = command.indexOf("--process-id");
  return command[runFlag + 1] === runId && command[processFlag + 1] === processId;
}

async function commandBelongsToRun(run: RunDocument): Promise<boolean> {
  if (!run.pid || !run.processId) return false;
  if (process.platform === "linux") {
    try {
      const command = (await readFile(`/proc/${run.pid}/cmdline`))
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      return commandArgumentsMatchRun(command, run.uuid, run.processId);
    } catch {
      return false;
    }
  }
  try {
    const probe = Bun.spawnSync(["ps", "-p", String(run.pid), "-o", "command="], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (probe.exitCode !== 0) return false;
    return commandArgumentsMatchRun(
      probe.stdout.toString().trim().split(/\s+/),
      run.uuid,
      run.processId,
    );
  } catch {
    return false;
  }
}

function requiredProcessId(run: RunDocument): string {
  if (!run.processId) throw new AgentAttemptInactiveError();
  return run.processId;
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
        try {
          await this.inspect(run);
        } catch (cause) {
          if (!(cause instanceof AgentAttemptInactiveError)) throw cause;
        }
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

    const ownsProcess = run.pid
      ? (await this.store.processOwnsRun(run)) && (await commandBelongsToRun(run))
      : false;
    if (run.pid && (!ownsProcess || !processExists(run.pid))) {
      if (run.status === "cancel_requested") {
        await this.transition(run, "cancelled", {
          terminalReason: ownsProcess ? "cancelled_by_actor" : "process_ownership_lost",
        });
      } else if (
        run.terminationRequestedAt &&
        (run.terminalReason === "deadline_exceeded" ||
          run.terminalReason === "heartbeat_stale" ||
          run.terminalReason?.endsWith(":sigkill"))
      ) {
        await this.transition(run, "timed_out", {
          terminalReason: run.terminalReason,
        });
      } else {
        await this.transition(run, "crashed", {
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
    if (!run.pid) {
      await this.transition(run, "timed_out", { terminalReason: reason });
      return;
    }
    if (!(await this.store.processOwnsRun(run)) || !(await commandBelongsToRun(run))) {
      await this.transition(run, "timed_out", {
        terminalReason: `${reason}:process_ownership_lost`,
      });
      return;
    }
    if (!run.terminationRequestedAt) {
      await this.store.noteTerminationRequested(run.uuid, requiredProcessId(run), reason);
      try {
        process.kill(run.pid, "SIGTERM");
      } catch {
        await this.transition(run, "timed_out", {
          terminalReason: `${reason}:process_missing`,
        });
        return;
      }
      return;
    }
    if (Date.now() - Date.parse(run.terminationRequestedAt) > this.config.runtime.cancelGraceMs) {
      try {
        process.kill(run.pid, "SIGKILL");
      } catch {
        await this.transition(run, "timed_out", { terminalReason: reason });
        return;
      }
      await this.store.noteForcedTermination(run.uuid, requiredProcessId(run), `${reason}:sigkill`);
    }
  }

  private async stopForCancellation(run: RunDocument): Promise<void> {
    if (!run.pid) {
      await this.transition(run, "cancelled", {
        terminalReason: "cancelled_before_process",
      });
      return;
    }
    if (!(await this.store.processOwnsRun(run)) || !(await commandBelongsToRun(run))) {
      await this.transition(run, "cancelled", {
        terminalReason: "process_ownership_lost",
      });
      return;
    }
    if (!run.terminationRequestedAt) {
      try {
        process.kill(run.pid, "SIGTERM");
      } catch {
        await this.transition(run, "cancelled", {
          terminalReason: "cancelled_process_missing",
        });
        return;
      }
      await this.store.noteTerminationRequested(
        run.uuid,
        requiredProcessId(run),
        "cancel_requested",
      );
      return;
    }
    if (Date.now() - Date.parse(run.terminationRequestedAt) > this.config.runtime.cancelGraceMs) {
      try {
        process.kill(run.pid, "SIGKILL");
      } catch {
        await this.transition(run, "cancelled", {
          terminalReason: "cancelled_process_missing",
        });
        return;
      }
      await this.store.noteForcedTermination(
        run.uuid,
        requiredProcessId(run),
        "cancel_grace_exceeded",
      );
    }
  }

  private transition(
    run: RunDocument,
    status: Parameters<AgentStore["transition"]>[1],
    updates: Partial<RunDocument>,
  ) {
    return this.store.transition(run.uuid, status, updates, run.processId ?? undefined);
  }
}

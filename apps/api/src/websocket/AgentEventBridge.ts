import type { AgentRunEvent } from "@stock42/contracts/agent";
import type { AgentClient } from "@/modules/agent/services/AgentClient";

type TrackedRun = {
  runId: string;
  tenantId: string;
  cursor: number;
  subscribers: number;
};

export class AgentEventBridge {
  private readonly tracked = new Map<string, TrackedRun>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(
    private readonly client: AgentClient,
    private readonly publish: (event: AgentRunEvent) => void,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), 1_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  track(runId: string, tenantId: string, cursor = 0): void {
    const current = this.tracked.get(runId);
    if (current) {
      current.subscribers += 1;
      current.cursor = Math.min(current.cursor, cursor);
      return;
    }
    this.tracked.set(runId, { runId, tenantId, cursor, subscribers: 1 });
  }

  untrack(runId: string): void {
    const current = this.tracked.get(runId);
    if (!current) return;
    current.subscribers -= 1;
    if (current.subscribers <= 0) this.tracked.delete(runId);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const tracked of this.tracked.values()) {
        try {
          const response = await this.client.events(
            tracked.runId,
            tracked.tenantId,
            "00000000-0000-4000-8000-000000000000",
            tracked.cursor,
          );
          for (const event of response.data.events) this.publish(event);
          tracked.cursor = response.data.nextCursor;
        } catch {
          // The next poll retries from the same durable cursor.
        }
      }
    } finally {
      this.polling = false;
    }
  }
}

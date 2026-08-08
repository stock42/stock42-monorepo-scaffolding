import type { AgentRunEvent } from "@stock42/contracts/agent";
import type { ActorRole } from "@stock42/contracts/auth";
import type { AgentClient } from "@/modules/agent/services/AgentClient";

type BridgeSubscriber = {
  actorId: string;
  actorRole: ActorRole;
};

type TrackedRun = {
  runId: string;
  tenantId: string;
  cursor: number;
  cursorRevision: number;
  subscribers: Map<string, BridgeSubscriber>;
};

function trackedRunKey(runId: string, tenantId: string): string {
  return `${tenantId}:${runId}`;
}

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
    this.tracked.clear();
  }

  track(
    subscriptionId: string,
    runId: string,
    tenantId: string,
    actorId: string,
    actorRole: ActorRole,
    cursor = 0,
  ): void {
    const key = trackedRunKey(runId, tenantId);
    const current = this.tracked.get(key);
    if (current) {
      current.subscribers.set(subscriptionId, { actorId, actorRole });
      if (cursor < current.cursor) {
        current.cursor = cursor;
        current.cursorRevision += 1;
      }
      return;
    }

    this.tracked.set(key, {
      runId,
      tenantId,
      cursor,
      cursorRevision: 0,
      subscribers: new Map([[subscriptionId, { actorId, actorRole }]]),
    });
  }

  untrack(subscriptionId: string, runId: string, tenantId: string): void {
    const key = trackedRunKey(runId, tenantId);
    const current = this.tracked.get(key);
    if (!current) return;
    current.subscribers.delete(subscriptionId);
    if (current.subscribers.size === 0) this.tracked.delete(key);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const [key, tracked] of this.tracked) {
        const requestedCursor = tracked.cursor;
        const requestedRevision = tracked.cursorRevision;
        let response: Awaited<ReturnType<AgentClient["events"]>> | null = null;

        for (const subscriber of tracked.subscribers.values()) {
          try {
            response = await this.client.events(
              tracked.runId,
              tracked.tenantId,
              subscriber.actorId,
              subscriber.actorRole,
              requestedCursor,
            );
            break;
          } catch {
            // Another still-authorized subscriber may continue the shared bridge.
          }
        }

        if (!response || this.tracked.get(key) !== tracked || tracked.subscribers.size === 0) {
          continue;
        }

        for (const event of response.data.events) this.publish(event);
        if (tracked.cursorRevision === requestedRevision) {
          tracked.cursor = Math.max(tracked.cursor, response.data.nextCursor);
        }
      }
    } finally {
      this.polling = false;
    }
  }
}

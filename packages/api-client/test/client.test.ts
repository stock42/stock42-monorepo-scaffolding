import { afterEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { STOCK42_REALTIME_SUBPROTOCOL } from "@stock42/contracts/websocket";
import { ApiClientError, apiRequest, filterForwardHeaders } from "../src";
import {
  AgentRealtimeClient,
  type RealtimeEventMessage,
  type RealtimeSocket,
} from "../src/realtime";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("API client", () => {
  test("rejects HTML without attempting JSON parsing", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("<html>proxy error</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      apiRequest({
        baseUrl: "http://api.example.test",
        path: "/health/live",
        schema: z.unknown(),
      }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  test("filters hop-by-hop headers", () => {
    const filtered = filterForwardHeaders(
      new Headers({ connection: "keep-alive", "x-correlation-id": "one" }),
    );

    expect(filtered.has("connection")).toBe(false);
    expect(filtered.get("x-correlation-id")).toBe("one");
  });

  test("reconnects with a fresh ticket and replays native events in sequence", async () => {
    const sockets: FakeRealtimeSocket[] = [];
    const socketUrls: string[] = [];
    const events: RealtimeEventMessage[] = [];
    let ticketRequests = 0;
    const tenantId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const channel = `agent:run:${runId}`;
    const fetcher = mock((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/auth/csrf")) {
        return Promise.resolve(Response.json({ ok: true, data: { csrfToken: "c".repeat(32) } }));
      }
      ticketRequests += 1;
      return Promise.resolve(
        Response.json({
          ok: true,
          data: {
            ticket: `ticket-${ticketRequests}-${"x".repeat(32)}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            webSocketUrl: "ws://127.0.0.1:3822/ws",
          },
        }),
      );
    }) as unknown as typeof fetch;

    const client = new AgentRealtimeClient({
      fetch: fetcher,
      reconnectDelaysMs: [0],
      createWebSocket: (url, protocol) => {
        socketUrls.push(url);
        const socket = new FakeRealtimeSocket(protocol);
        sockets.push(socket);
        return socket;
      },
      onEvent: (event) => events.push(event),
    });
    client.subscribe(channel, { tenantId, cursor: 0 });
    client.start();

    await waitFor(() => sockets.length === 1);
    const first = sockets[0]!;
    first.open();
    first.message({
      type: "ready",
      connectionId: crypto.randomUUID(),
      protocol: STOCK42_REALTIME_SUBPROTOCOL,
    });
    expect(JSON.parse(first.sent[0]!)).toMatchObject({
      type: "subscribe",
      channel,
      cursor: 0,
      tenantId,
    });

    first.message(serverEvent(channel, 2));
    expect(events).toHaveLength(0);
    first.message(serverEvent(channel, 1));
    expect(events.map((event) => event.cursor)).toEqual([1, 2]);

    first.remoteClose(1000);
    await waitFor(() => sockets.length === 2);
    const second = sockets[1]!;
    second.open();
    second.message({
      type: "ready",
      connectionId: crypto.randomUUID(),
      protocol: STOCK42_REALTIME_SUBPROTOCOL,
    });
    expect(ticketRequests).toBe(2);
    expect(new URL(socketUrls[0]!).searchParams.get("ticket")).toStartWith("ticket-1-");
    expect(new URL(socketUrls[1]!).searchParams.get("ticket")).toStartWith("ticket-2-");
    expect(JSON.parse(second.sent[0]!)).toMatchObject({
      type: "subscribe",
      channel,
      cursor: 2,
      tenantId,
    });
    client.stop();
  });
});

type FakeSocketListeners = {
  open: Array<() => void>;
  message: Array<(event: { data: unknown }) => void>;
  error: Array<() => void>;
  close: Array<(event: { code: number }) => void>;
};

class FakeRealtimeSocket implements RealtimeSocket {
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners: FakeSocketListeners = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(readonly protocol: string) {}

  addEventListener(type: "open" | "message" | "error" | "close", listener: never): void {
    (this.listeners[type] as never[]).push(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.remoteClose(code);
  }

  open(): void {
    this.readyState = 1;
    for (const listener of this.listeners.open) listener();
  }

  message(payload: unknown): void {
    for (const listener of this.listeners.message) listener({ data: JSON.stringify(payload) });
  }

  remoteClose(code: number): void {
    this.readyState = 3;
    for (const listener of this.listeners.close) listener({ code });
  }
}

function serverEvent(channel: string, cursor: number): RealtimeEventMessage {
  return {
    type: "event",
    channel,
    cursor,
    payload: { sequence: cursor },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Bun.sleep(1);
  }
  throw new Error("Timed out waiting for realtime state");
}

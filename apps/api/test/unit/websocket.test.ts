import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SessionActor } from "@stock42/contracts/auth";
import {
  STOCK42_REALTIME_SUBPROTOCOL,
  WebSocketServerMessageSchema,
} from "@stock42/contracts/websocket";
import type { WebSocketData } from "s42-core";
import type { ApiConfig } from "@/config";
import type { AgentClient } from "@/modules/agent/services/AgentClient";
import { agentRunTopic, WebSocketGateway } from "@/websocket/WebSocketGateway";
import { stopSharedListener } from "@/websocket/stop-listener";

const tenantId = "20000000-0000-4000-8000-000000000001";
const runId = "30000000-0000-4000-8000-000000000001";
const actor: SessionActor = {
  uuid: "10000000-0000-4000-8000-000000000001",
  kind: "user",
  role: "tenant_user",
  tenantId,
  email: "user@example.test",
  displayName: "API Test User",
};
const runEvent = {
  uuid: "40000000-0000-4000-8000-000000000001",
  runId,
  tenantId,
  sequence: 1,
  type: "run.status",
  payload: { status: "running" },
  createdAt: new Date().toISOString(),
};

let server: Bun.Server<WebSocketData>;
let gateway: WebSocketGateway;

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket message timeout")), 2_000);
    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(String(event.data)));
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      },
      { once: true },
    );
  });
}

async function openSocket(): Promise<WebSocket> {
  const url = new URL("/ws?ticket=valid-ticket", server.url);
  url.protocol = "ws:";
  const socket = new WebSocket(url, STOCK42_REALTIME_SUBPROTOCOL);
  const message = WebSocketServerMessageSchema.parse(await nextMessage(socket));
  expect(message).toMatchObject({
    type: "ready",
    protocol: STOCK42_REALTIME_SUBPROTOCOL,
  });
  return socket;
}

async function closeSocket(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve) => {
    socket.addEventListener("close", () => resolve(), { once: true });
    socket.close();
  });
}

describe("native s42-core WebSocket gateway", () => {
  beforeAll(() => {
    const tickets = {
      async consume(ticket: string) {
        if (ticket !== "valid-ticket") throw new Error("Invalid ticket");
        return actor;
      },
    };
    const auth = {
      async revalidateActor(candidate: SessionActor) {
        return candidate;
      },
    };
    const agentClient = {
      async getRun() {
        return { data: { uuid: runId } };
      },
      async events(
        _runId: string,
        _tenantId: string,
        _actorId: string,
        _actorRole: string,
        cursor: number,
      ) {
        return {
          data: {
            events: cursor === 0 ? [runEvent] : [],
            nextCursor: Math.max(cursor, 1),
          },
        };
      },
    } as unknown as AgentClient;
    gateway = new WebSocketGateway(tickets, agentClient, auth, {
      corsOrigins: ["*"],
    } as ApiConfig);

    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      websocket: gateway.controllers.getHandler(),
      async fetch(request, bunServer) {
        const upgrade = await gateway.controllers.tryUpgrade(request, bunServer);
        return upgrade.matched ? upgrade.response : new Response("Not Found", { status: 404 });
      },
    });
  });

  afterAll(async () => {
    const listenerStop = stopSharedListener(server, gateway.controllers.getActiveConnections());
    gateway.stop();
    await listenerStop;
  });

  test("negotiates the versioned protocol through s42-core", async () => {
    const socket = await openSocket();
    expect(gateway.controllers.getPaths()).toEqual(["/ws"]);
    expect(socket.protocol).toBe(STOCK42_REALTIME_SUBPROTOCOL);
    await closeSocket(socket);
  });

  test("uses native Bun topics for authorized run subscriptions", async () => {
    const socket = await openSocket();
    const ack = nextMessage(socket);
    socket.send(
      JSON.stringify({
        type: "subscribe",
        requestId: "subscribe-one",
        channel: `agent:run:${runId}`,
        cursor: 0,
      }),
    );
    expect(WebSocketServerMessageSchema.parse(await ack)).toMatchObject({
      type: "ack",
      requestId: "subscribe-one",
    });

    const topic = agentRunTopic(tenantId, runId);
    expect(server.subscriberCount(topic)).toBe(1);
    const event = nextMessage(socket);
    gateway.start(server);
    expect(WebSocketServerMessageSchema.parse(await event)).toMatchObject({
      type: "event",
      cursor: 1,
    });

    const unsubscribeAck = nextMessage(socket);
    socket.send(
      JSON.stringify({
        type: "unsubscribe",
        requestId: "unsubscribe-one",
        channel: `agent:run:${runId}`,
      }),
    );
    expect(WebSocketServerMessageSchema.parse(await unsubscribeAck)).toMatchObject({
      type: "ack",
      requestId: "unsubscribe-one",
    });
    expect(server.subscriberCount(topic)).toBe(0);
    await closeSocket(socket);
  });
});

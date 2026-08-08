import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SessionActor } from "@stock42/contracts/auth";
import { WebSocketServerMessageSchema } from "@stock42/contracts/websocket";
import type { WebSocketData } from "s42-core";
import type { ApiConfig } from "@/config";
import type { AgentClient } from "@/modules/agent/services/AgentClient";
import type { AuthService } from "@/modules/auth/services/AuthService";
import { WebSocketGateway } from "@/websocket/WebSocketGateway";
import type { WebSocketTicketService } from "@/websocket/WebSocketTicketService";

const actor: SessionActor = {
  uuid: "10000000-0000-4000-8000-000000000001",
  kind: "administrator",
  role: "platform_admin",
  tenantId: null,
  email: "admin@example.test",
  displayName: "API Test Administrator",
};

let server: Bun.Server<WebSocketData>;
let gateway: WebSocketGateway;

describe("native s42-core WebSocket gateway", () => {
  beforeAll(() => {
    const tickets = {
      async consume(ticket: string) {
        if (ticket !== "valid-ticket") throw new Error("Invalid ticket");
        return actor;
      },
    } as unknown as WebSocketTicketService;
    const auth = {
      async revalidateActor(candidate: SessionActor) {
        return candidate;
      },
    } as AuthService;
    gateway = new WebSocketGateway(tickets, {} as AgentClient, auth, {
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
    await server.stop(true);
  });

  test("opens /ws through WebSocketController and sends the ready contract", async () => {
    const url = new URL("/ws?ticket=valid-ticket", server.url);
    url.protocol = "ws:";
    const socket = new WebSocket(url);

    const message = await new Promise<unknown>((resolve, reject) => {
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

    expect(gateway.controllers.getPaths()).toEqual(["/ws"]);
    expect(WebSocketServerMessageSchema.parse(message).type).toBe("ready");
    socket.close();
  });
});

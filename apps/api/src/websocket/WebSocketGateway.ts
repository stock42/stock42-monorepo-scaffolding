import type { AgentRunEvent } from "@stock42/contracts/agent";
import type { SessionActor } from "@stock42/contracts/auth";
import {
  WebSocketClientMessageSchema,
  type WebSocketServerMessage,
} from "@stock42/contracts/websocket";
import type { ApiConfig } from "@/config";
import { resolveCorsOrigin } from "@/http/cors";
import type { AgentClient } from "@/modules/agent/services/AgentClient";
import { AgentEventBridge } from "./AgentEventBridge";
import type { WebSocketTicketService } from "./WebSocketTicketService";

export type SocketData = {
  connectionId: string;
  actor: SessionActor;
  channels: Set<string>;
  lastSeenAt: number;
  messageWindowStartedAt: number;
  messagesInWindow: number;
};

export class WebSocketGateway {
  private readonly sockets = new Set<Bun.ServerWebSocket<SocketData>>();
  private readonly bridge: AgentEventBridge;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  readonly handler: Bun.WebSocketHandler<SocketData>;

  constructor(
    private readonly tickets: WebSocketTicketService,
    private readonly agentClient: AgentClient,
    private readonly config: ApiConfig,
  ) {
    this.bridge = new AgentEventBridge(agentClient, (event) => this.publish(event));
    this.handler = {
      maxPayloadLength: 64 * 1024,
      backpressureLimit: 256 * 1024,
      closeOnBackpressureLimit: true,
      open: (socket) => {
        this.sockets.add(socket);
        this.send(socket, {
          type: "ready",
          connectionId: socket.data.connectionId,
        });
      },
      message: async (socket, raw) => {
        socket.data.lastSeenAt = Date.now();
        if (!this.consumeMessageRate(socket)) {
          socket.close(1008, "Rate limit");
          return;
        }
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          this.send(socket, { type: "error", code: "INVALID_JSON", message: "Mensaje inválido." });
          return;
        }
        const message = WebSocketClientMessageSchema.safeParse(payload);
        if (!message.success) {
          this.send(socket, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "Mensaje fuera de contrato.",
          });
          return;
        }

        if (message.data.type === "ping") {
          this.send(socket, { type: "pong", requestId: message.data.requestId });
          return;
        }
        if (message.data.type === "unsubscribe") {
          this.unsubscribe(socket, message.data.channel);
          this.send(socket, {
            type: "ack",
            requestId: message.data.requestId,
            channel: message.data.channel,
          });
          return;
        }
        if (socket.data.channels.size >= 20) {
          this.send(socket, {
            type: "error",
            requestId: message.data.requestId,
            code: "TOO_MANY_CHANNELS",
            message: "Se alcanzó el máximo de canales.",
          });
          return;
        }

        const runId = message.data.channel.slice("agent:run:".length);
        try {
          await this.agentClient.getRun(
            runId,
            socket.data.actor.tenantId ?? "",
            socket.data.actor.uuid,
          );
        } catch {
          this.send(socket, {
            type: "error",
            requestId: message.data.requestId,
            code: "FORBIDDEN_CHANNEL",
            message: "Canal no autorizado.",
          });
          return;
        }
        if (!socket.data.channels.has(message.data.channel)) {
          socket.data.channels.add(message.data.channel);
          this.bridge.track(runId, socket.data.actor.tenantId ?? "", message.data.cursor ?? 0);
        }
        this.send(socket, {
          type: "ack",
          requestId: message.data.requestId,
          channel: message.data.channel,
        });
      },
      close: (socket) => {
        for (const channel of socket.data.channels) this.unsubscribe(socket, channel);
        this.sockets.delete(socket);
      },
      pong: (socket) => {
        socket.data.lastSeenAt = Date.now();
      },
    };
  }

  start(): void {
    this.bridge.start();
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      const cutoff = Date.now() - 60_000;
      for (const socket of this.sockets) {
        if (socket.data.lastSeenAt < cutoff) {
          socket.close(1001, "Heartbeat timeout");
        } else {
          socket.ping();
        }
      }
    }, 25_000);
  }

  stop(): void {
    this.bridge.stop();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const socket of this.sockets) socket.close(1001, "Server shutdown");
  }

  async upgrade(request: Request, server: Bun.Server<SocketData>): Promise<Response | undefined> {
    const origin = request.headers.get("origin");
    if (origin && !resolveCorsOrigin(request, this.config.corsOrigins)) {
      return new Response("Origin forbidden", { status: 403 });
    }
    const ticket = new URL(request.url).searchParams.get("ticket");
    if (!ticket) return new Response("Ticket required", { status: 401 });
    try {
      const actor = await this.tickets.consume(ticket);
      const upgraded = server.upgrade(request, {
        data: {
          connectionId: crypto.randomUUID(),
          actor,
          channels: new Set<string>(),
          lastSeenAt: Date.now(),
          messageWindowStartedAt: Date.now(),
          messagesInWindow: 0,
        },
      });
      return upgraded ? undefined : new Response("Upgrade failed", { status: 400 });
    } catch {
      return new Response("Ticket invalid", { status: 401 });
    }
  }

  private publish(event: AgentRunEvent): void {
    const channel = `agent:run:${event.runId}`;
    for (const socket of this.sockets) {
      if (socket.data.actor.tenantId === event.tenantId && socket.data.channels.has(channel)) {
        this.send(socket, {
          type: "event",
          channel,
          cursor: event.sequence,
          payload: { ...event },
        });
      }
    }
  }

  private unsubscribe(socket: Bun.ServerWebSocket<SocketData>, channel: string): void {
    if (!socket.data.channels.delete(channel)) return;
    if (channel.startsWith("agent:run:")) {
      this.bridge.untrack(channel.slice("agent:run:".length));
    }
  }

  private consumeMessageRate(socket: Bun.ServerWebSocket<SocketData>): boolean {
    const now = Date.now();
    if (now - socket.data.messageWindowStartedAt >= 60_000) {
      socket.data.messageWindowStartedAt = now;
      socket.data.messagesInWindow = 0;
    }
    socket.data.messagesInWindow += 1;
    return socket.data.messagesInWindow <= 60;
  }

  private send(socket: Bun.ServerWebSocket<SocketData>, message: WebSocketServerMessage): void {
    if (socket.getBufferedAmount() > 256 * 1024) {
      socket.close(1009, "Backpressure");
      return;
    }
    socket.send(JSON.stringify(message), false);
  }
}

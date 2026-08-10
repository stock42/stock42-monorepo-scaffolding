import type { AgentRunEvent } from "@stock42/contracts/agent";
import type { SessionActor } from "@stock42/contracts/auth";
import {
  STOCK42_REALTIME_SUBPROTOCOL,
  WebSocketClientMessageSchema,
  type WebSocketServerMessage,
} from "@stock42/contracts/websocket";
import { WebSocketController, WebSocketControllers, type WebSocketMessage } from "s42-core";
import type { ApiConfig } from "@/config";
import { resolveCorsOrigin } from "@/http/cors";
import type { AgentClient } from "@/modules/agent/services/AgentClient";
import type { AuthService } from "@/modules/auth/services/AuthService";
import { AgentEventBridge } from "./AgentEventBridge";
import type { WebSocketTicketService } from "./WebSocketTicketService";

const MAX_CHANNELS_PER_SOCKET = 20;
const MAX_MESSAGES_PER_MINUTE = 60;
const SOCKET_SESSION_TTL_MS = 5 * 60_000;

type SocketSubscription = {
  channel: string;
  topic: string;
  runId: string;
  tenantId: string;
};

export type SocketData = {
  connectionId: string;
  actor: SessionActor;
  subscriptions: Map<string, SocketSubscription>;
  connectedAt: number;
  messageWindowStartedAt: number;
  messagesInWindow: number;
};

export type WebSocketPublisher = Pick<
  Bun.Server<Record<string, unknown>>,
  "publish" | "subscriberCount"
>;

type TicketConsumer = Pick<typeof WebSocketTicketService, "consume">;
type ActorAuthenticator = Pick<typeof AuthService, "revalidateActor">;

export function agentRunTopic(tenantId: string, runId: string): string {
  return `tenant:${tenantId}:agent:run:${runId}`;
}

export class WebSocketGateway {
  private readonly sockets = new Set<Bun.ServerWebSocket<SocketData>>();
  private readonly bridge: AgentEventBridge;
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private publisher: WebSocketPublisher | null = null;

  readonly controllers: WebSocketControllers;

  constructor(
    private readonly tickets: TicketConsumer,
    private readonly agentClient: AgentClient,
    private readonly auth: ActorAuthenticator,
    private readonly config: ApiConfig,
  ) {
    this.bridge = new AgentEventBridge(agentClient, (event) => this.publish(event));
    const controller = new WebSocketController<SocketData>({
      path: "/ws",
      upgrade: ({ request }) => this.authorizeUpgrade(request),
      open: (socket) => {
        this.sockets.add(socket);
        this.send(socket, {
          type: "ready",
          connectionId: socket.data.connectionId,
          protocol: STOCK42_REALTIME_SUBPROTOCOL,
        });
      },
      message: (socket, raw) => this.onMessage(socket, raw),
      close: (socket) => {
        for (const subscription of socket.data.subscriptions.values()) {
          socket.unsubscribe(subscription.topic);
          this.bridge.untrack(
            this.subscriptionId(socket, subscription.channel),
            subscription.runId,
            subscription.tenantId,
          );
        }
        socket.data.subscriptions.clear();
        this.sockets.delete(socket);
      },
    });
    this.controllers = new WebSocketControllers([controller], {
      maxPayloadLength: 64 * 1024,
      idleTimeout: 70,
      backpressureLimit: 256 * 1024,
      closeOnBackpressureLimit: true,
      publishToSelf: false,
      sendPings: true,
      perMessageDeflate: false,
    });
  }

  start(publisher: WebSocketPublisher): void {
    this.publisher = publisher;
    this.bridge.start();
    if (this.sessionTimer) return;
    this.sessionTimer = setInterval(() => {
      const cutoff = Date.now() - SOCKET_SESSION_TTL_MS;
      for (const socket of this.sockets) {
        if (socket.data.connectedAt <= cutoff) {
          socket.close(1008, "Session refresh required");
        }
      }
    }, 60_000);
  }

  stop(): void {
    this.bridge.stop();
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    this.sessionTimer = null;
    this.controllers.closeAll(1001, "Server shutdown");
    this.publisher = null;
  }

  private async authorizeUpgrade(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && !resolveCorsOrigin(request, this.config.corsOrigins)) {
      return new Response("Origin forbidden", { status: 403 });
    }

    const offeredProtocols =
      request.headers
        .get("sec-websocket-protocol")
        ?.split(",")
        .map((value) => value.trim()) ?? [];
    if (!offeredProtocols.includes(STOCK42_REALTIME_SUBPROTOCOL)) {
      return new Response("Unsupported WebSocket protocol", { status: 400 });
    }

    const tickets = new URL(request.url).searchParams.getAll("ticket");
    if (tickets.length !== 1 || !tickets[0]) {
      return new Response("Ticket required", { status: 401 });
    }
    try {
      const actor = await this.auth.revalidateActor(await this.tickets.consume(tickets[0]));
      return {
        data: {
          connectionId: crypto.randomUUID(),
          actor,
          subscriptions: new Map<string, SocketSubscription>(),
          connectedAt: Date.now(),
          messageWindowStartedAt: Date.now(),
          messagesInWindow: 0,
        },
        headers: { "Sec-WebSocket-Protocol": STOCK42_REALTIME_SUBPROTOCOL },
      };
    } catch {
      return new Response("Ticket invalid", { status: 401 });
    }
  }

  private async onMessage(
    socket: Bun.ServerWebSocket<SocketData>,
    raw: WebSocketMessage,
  ): Promise<void> {
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
    if (
      !socket.data.subscriptions.has(message.data.channel) &&
      socket.data.subscriptions.size >= MAX_CHANNELS_PER_SOCKET
    ) {
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
      const actor = await this.auth.revalidateActor(socket.data.actor);
      const tenantId = this.resolveTenantId(actor, message.data.tenantId);
      await this.agentClient.getRun(runId, tenantId, actor.uuid, actor.role);
      socket.data.actor = actor;

      const existing = socket.data.subscriptions.get(message.data.channel);
      if (existing && existing.tenantId !== tenantId) throw new Error("Tenant mismatch");
      if (!existing) {
        const topic = agentRunTopic(tenantId, runId);
        socket.subscribe(topic);
        const subscription = { channel: message.data.channel, topic, runId, tenantId };
        socket.data.subscriptions.set(message.data.channel, subscription);
      }
      this.bridge.track(
        this.subscriptionId(socket, message.data.channel),
        runId,
        tenantId,
        actor.uuid,
        actor.role,
        message.data.cursor ?? 0,
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

    this.send(socket, {
      type: "ack",
      requestId: message.data.requestId,
      channel: message.data.channel,
    });
  }

  private resolveTenantId(actor: SessionActor, requestedTenantId: string | undefined): string {
    if (actor.tenantId) {
      if (requestedTenantId && requestedTenantId !== actor.tenantId) {
        throw new Error("Tenant mismatch");
      }
      return actor.tenantId;
    }
    if (actor.role !== "platform_admin" || !requestedTenantId) {
      throw new Error("Tenant required");
    }
    return requestedTenantId;
  }

  private publish(event: AgentRunEvent): void {
    const publisher = this.publisher;
    if (!publisher) return;
    const topic = agentRunTopic(event.tenantId, event.runId);
    if (publisher.subscriberCount(topic) === 0) return;
    const message: WebSocketServerMessage = {
      type: "event",
      channel: `agent:run:${event.runId}`,
      cursor: event.sequence,
      payload: { ...event },
    };
    publisher.publish(topic, JSON.stringify(message), false);
  }

  private unsubscribe(socket: Bun.ServerWebSocket<SocketData>, channel: string): void {
    const subscription = socket.data.subscriptions.get(channel);
    if (!subscription) return;
    socket.data.subscriptions.delete(channel);
    socket.unsubscribe(subscription.topic);
    this.bridge.untrack(
      this.subscriptionId(socket, channel),
      subscription.runId,
      subscription.tenantId,
    );
  }

  private subscriptionId(socket: Bun.ServerWebSocket<SocketData>, channel: string): string {
    return `${socket.data.connectionId}:${channel}`;
  }

  private consumeMessageRate(socket: Bun.ServerWebSocket<SocketData>): boolean {
    const now = Date.now();
    if (now - socket.data.messageWindowStartedAt >= 60_000) {
      socket.data.messageWindowStartedAt = now;
      socket.data.messagesInWindow = 0;
    }
    socket.data.messagesInWindow += 1;
    return socket.data.messagesInWindow <= MAX_MESSAGES_PER_MINUTE;
  }

  private send(socket: Bun.ServerWebSocket<SocketData>, message: WebSocketServerMessage): void {
    if (socket.getBufferedAmount() > 256 * 1024) {
      socket.close(1009, "Backpressure");
      return;
    }
    socket.send(JSON.stringify(message), false);
  }
}

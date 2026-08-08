import { CsrfResponseSchema } from "@stock42/contracts/auth";
import {
  STOCK42_REALTIME_SUBPROTOCOL,
  WebSocketServerMessageSchema,
  WebSocketTicketResponseSchema,
  type WebSocketClientMessage,
  type WebSocketServerMessage,
} from "@stock42/contracts/websocket";

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const MAX_BUFFERED_EVENTS_PER_CHANNEL = 1_000;

export type RealtimeConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export type RealtimeEventMessage = Extract<WebSocketServerMessage, { type: "event" }>;

type RealtimeSubscription = {
  channel: string;
  tenantId?: string;
  cursor: number;
  pending: Map<number, RealtimeEventMessage>;
};

export type RealtimeSocket = {
  readonly readyState: number;
  readonly protocol: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: "close", listener: (event: { code: number }) => void): void;
};

export type AgentRealtimeClientOptions = {
  onEvent: (message: RealtimeEventMessage) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
  onError?: (message: string) => void;
  fetch?: typeof fetch;
  createWebSocket?: (url: string, protocol: string) => RealtimeSocket;
  reconnectDelaysMs?: readonly number[];
  csrfPath?: string;
  ticketPath?: string;
};

export class AgentRealtimeClient {
  private readonly fetcher: typeof fetch;
  private readonly createSocket: (url: string, protocol: string) => RealtimeSocket;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly subscriptions = new Map<string, RealtimeSubscription>();
  private socket: RealtimeSocket | null = null;
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private reconnectAttempt = 0;
  private connecting = false;
  private stopped = true;
  private state: RealtimeConnectionState = "idle";

  constructor(private readonly options: AgentRealtimeClientOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.createSocket =
      options.createWebSocket ??
      ((url, protocol) => new WebSocket(url, protocol) as unknown as RealtimeSocket);
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? [500, 1_000, 2_000, 5_000, 10_000];
  }

  get connectionState(): RealtimeConnectionState {
    return this.state;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.reconnectAttempt = 0;
    void this.connect();
  }

  stop(): void {
    if (this.stopped && this.state === "closed") return;
    this.stopped = true;
    this.generation += 1;
    this.clearReconnectTimer();
    this.abortController?.abort();
    this.abortController = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < SOCKET_CLOSING) socket.close(1000, "Client shutdown");
    this.setState("closed");
  }

  subscribe(channel: string, options: { cursor?: number; tenantId?: string } = {}): void {
    const current = this.subscriptions.get(channel);
    if (current) {
      if (options.tenantId !== undefined) current.tenantId = options.tenantId;
      if (options.cursor !== undefined) this.advanceCursor(channel, options.cursor);
    } else {
      this.subscriptions.set(channel, {
        channel,
        tenantId: options.tenantId,
        cursor: options.cursor ?? 0,
        pending: new Map(),
      });
    }
    if (this.state === "open") this.sendSubscription(this.subscriptions.get(channel)!);
  }

  unsubscribe(channel: string): void {
    if (!this.subscriptions.has(channel)) return;
    if (this.state === "open") {
      this.send({ type: "unsubscribe", requestId: crypto.randomUUID(), channel });
    }
    this.subscriptions.delete(channel);
  }

  advanceCursor(channel: string, cursor: number): void {
    const subscription = this.subscriptions.get(channel);
    if (!subscription || cursor <= subscription.cursor) return;
    subscription.cursor = cursor;
    for (const sequence of subscription.pending.keys()) {
      if (sequence <= cursor) subscription.pending.delete(sequence);
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    const generation = ++this.generation;
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    this.setState(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");

    try {
      const csrfResponse = await this.fetcher(this.options.csrfPath ?? "/api/auth/csrf", {
        method: "POST",
        credentials: "same-origin",
        signal: abortController.signal,
      });
      if (!csrfResponse.ok) throw new Error("CSRF request failed");
      const csrf = CsrfResponseSchema.parse(await csrfResponse.json());

      const ticketResponse = await this.fetcher(
        this.options.ticketPath ?? "/api/auth/ws-tickets/create",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "x-csrf-token": csrf.data.csrfToken },
          signal: abortController.signal,
        },
      );
      if (!ticketResponse.ok) throw new Error("WebSocket ticket request failed");
      const ticket = WebSocketTicketResponseSchema.parse(await ticketResponse.json());
      if (this.stopped || generation !== this.generation) return;

      const url = new URL(ticket.data.webSocketUrl);
      url.searchParams.set("ticket", ticket.data.ticket);
      const socket = this.createSocket(url.toString(), STOCK42_REALTIME_SUBPROTOCOL);
      this.socket = socket;
      socket.addEventListener("open", () => this.onOpen(socket));
      socket.addEventListener("message", (event) => this.onMessage(socket, event.data));
      socket.addEventListener("error", () => this.onSocketError(socket));
      socket.addEventListener("close", () => this.onClose(socket));
    } catch {
      if (!this.stopped && !abortController.signal.aborted) {
        this.options.onError?.("No fue posible abrir el canal WebSocket.");
        this.scheduleReconnect();
      }
    } finally {
      if (this.abortController === abortController) this.abortController = null;
      this.connecting = false;
    }
  }

  private onOpen(socket: RealtimeSocket): void {
    if (socket !== this.socket || this.stopped) return;
    if (socket.protocol !== STOCK42_REALTIME_SUBPROTOCOL) {
      socket.close(1002, "Subprotocol mismatch");
    }
  }

  private onMessage(socket: RealtimeSocket, raw: unknown): void {
    if (socket !== this.socket || this.stopped || typeof raw !== "string") return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      socket.close(1002, "Invalid server message");
      return;
    }

    const parsed = WebSocketServerMessageSchema.safeParse(payload);
    if (!parsed.success) {
      socket.close(1002, "Invalid server contract");
      return;
    }
    const message = parsed.data;
    if (message.type === "ready") {
      if (message.protocol !== STOCK42_REALTIME_SUBPROTOCOL) {
        socket.close(1002, "Subprotocol mismatch");
        return;
      }
      this.reconnectAttempt = 0;
      this.setState("open");
      for (const subscription of this.subscriptions.values()) {
        this.sendSubscription(subscription);
      }
      return;
    }
    if (message.type === "event") {
      this.bufferEvent(message);
      return;
    }
    if (message.type === "error") this.options.onError?.(message.message);
  }

  private bufferEvent(message: RealtimeEventMessage): void {
    const subscription = this.subscriptions.get(message.channel);
    if (!subscription || message.cursor <= subscription.cursor) return;
    subscription.pending.set(message.cursor, message);
    if (subscription.pending.size > MAX_BUFFERED_EVENTS_PER_CHANNEL) {
      this.socket?.close(1011, "Replay buffer exceeded");
      return;
    }

    let next = subscription.pending.get(subscription.cursor + 1);
    while (next) {
      subscription.pending.delete(next.cursor);
      subscription.cursor = next.cursor;
      this.options.onEvent(next);
      next = subscription.pending.get(subscription.cursor + 1);
    }
  }

  private onSocketError(socket: RealtimeSocket): void {
    if (socket !== this.socket || this.stopped) return;
    this.options.onError?.("El canal WebSocket perdió la conexión.");
  }

  private onClose(socket: RealtimeSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    if (this.stopped) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.setState("reconnecting");
    const baseDelay =
      this.reconnectDelaysMs[Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1)] ??
      10_000;
    const jitter = baseDelay === 0 ? 0 : Math.round(baseDelay * 0.2 * (Math.random() * 2 - 1));
    const delay = Math.max(0, baseDelay + jitter);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private sendSubscription(subscription: RealtimeSubscription): void {
    this.send({
      type: "subscribe",
      requestId: crypto.randomUUID(),
      channel: subscription.channel,
      cursor: subscription.cursor,
      ...(subscription.tenantId ? { tenantId: subscription.tenantId } : {}),
    });
  }

  private send(message: WebSocketClientMessage): void {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private setState(state: RealtimeConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}

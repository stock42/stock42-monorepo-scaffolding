import type { AgentConfig } from "@/config";
import type { RunDocument } from "@/runtime/contracts/types";
import type { AgentStore } from "@/runtime/store/AgentStore";
import { TelegramService } from "@/tools/telegram/TelegramService";
import {
  sanitizedTelegramError,
  TelegramApiError,
  TelegramClient,
  type TelegramUpdate,
} from "./TelegramClient";

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function chunks(text: string): string[] {
  const maximum = 4_000;
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maximum) {
    const breakAt = Math.max(
      remaining.lastIndexOf("\n", maximum),
      remaining.lastIndexOf(" ", maximum),
    );
    const end = breakAt > maximum / 2 ? breakAt : maximum;
    result.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function metadataValue(run: RunDocument, key: string): string | null {
  const metadata =
    typeof run.input.metadata === "object" && run.input.metadata !== null
      ? (run.input.metadata as Record<string, unknown>)
      : {};
  return typeof metadata[key] === "string" ? metadata[key] : null;
}

function terminalMessage(run: RunDocument): string {
  if (run.status === "succeeded") {
    const output =
      typeof run.output === "object" && run.output !== null
        ? (run.output as Record<string, unknown>)
        : {};
    if (typeof output.answer === "string" && output.answer.trim()) return output.answer;
    return "La ejecución terminó sin una respuesta de texto.";
  }
  const labels: Record<string, string> = {
    failed: "La ejecución falló.",
    cancelled: "La ejecución fue cancelada.",
    timed_out: "La ejecución superó el tiempo máximo.",
    killed: "La ejecución fue detenida.",
    crashed: "La ejecución terminó inesperadamente.",
  };
  return labels[run.status] ?? `La ejecución terminó con estado ${run.status}.`;
}

export class TelegramPollingRuntime {
  private readonly controller = new AbortController();
  private readonly telegram: TelegramService;
  private stopped = false;
  private restartCount = 0;

  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
    private readonly client = new TelegramClient(config),
  ) {
    this.telegram = new TelegramService(config, store, client);
  }

  async run(): Promise<void> {
    if (!this.config.telegram.pollingEnabled || !this.config.telegram.botToken) {
      await this.store.setTelegramRuntimeStatus({
        enabled: false,
        state: "disabled",
        running: false,
        heartbeatAt: new Date().toISOString(),
        nextRetryAt: null,
      });
      return;
    }

    const previous = await this.store.telegramRuntimeStatus();
    this.restartCount = previous?.restartCount ?? 0;
    await this.store.setTelegramRuntimeStatus({
      enabled: true,
      state: "starting",
      running: true,
      heartbeatAt: new Date().toISOString(),
      lastError: null,
      nextRetryAt: null,
    });
    await Promise.all([this.pollLoop(), this.deliveryLoop()]);
    await this.store.setTelegramRuntimeStatus({
      enabled: true,
      state: "stopped",
      running: false,
      heartbeatAt: new Date().toISOString(),
      nextRetryAt: null,
    });
  }

  stop(): void {
    this.stopped = true;
    this.controller.abort();
  }

  private async pollLoop(): Promise<void> {
    let offset = await this.store.telegramOffset();
    let backoffMs = this.config.telegram.backoffMinMs;

    while (!this.stopped) {
      try {
        await this.store.setTelegramRuntimeStatus({
          enabled: true,
          state: "polling",
          running: true,
          heartbeatAt: new Date().toISOString(),
          lastError: null,
          nextRetryAt: null,
        });
        const updates = await this.client.getUpdates(
          {
            offset,
            timeoutSeconds: this.config.telegram.pollTimeoutSeconds,
          },
          this.controller.signal,
        );
        for (const update of updates) {
          await this.handleUpdate(update);
          offset = update.update_id + 1;
          await this.store.advanceTelegramOffset(offset);
        }
        await this.store.setTelegramRuntimeStatus({
          enabled: true,
          state: "polling",
          running: true,
          heartbeatAt: new Date().toISOString(),
          lastError: null,
          nextRetryAt: null,
        });
        backoffMs = this.config.telegram.backoffMinMs;
      } catch (cause) {
        if (this.stopped) return;
        const retryAfter =
          cause instanceof TelegramApiError && cause.retryAfterSeconds
            ? cause.retryAfterSeconds * 1_000
            : backoffMs;
        const message =
          cause instanceof TelegramApiError
            ? `${cause.code ?? "NETWORK"}: ${sanitizedTelegramError(
                cause,
                this.config.telegram.botToken,
                "Falló getUpdates.",
              )}`
            : "Falló el ciclo getUpdates.";
        await this.retry(message, retryAfter);
        backoffMs = Math.min(backoffMs * 2, this.config.telegram.backoffMaxMs);
      }
    }
  }

  private async deliveryLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        if (!this.config.telegram.botToken) {
          await wait(this.config.telegram.deliveryIntervalMs, this.controller.signal);
          continue;
        }
        for (const run of await this.store.telegramRunsForDelivery()) {
          await this.deliverRun(run);
        }
      } catch {
        console.warn("Telegram delivery reconciliation failed", {
          message: "Se reintentará sin detener getUpdates ni HTTP.",
        });
      }
      await wait(this.config.telegram.deliveryIntervalMs, this.controller.signal);
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || !message.from || message.from.is_bot || message.chat.type !== "private") {
      return;
    }

    const access = await this.store.findActiveTelegramAccess(String(message.from.id));
    if (!access) return;
    const chatId = String(message.chat.id);
    const text = message.text.trim();
    if (!text) return;
    const command = text.match(/^\/([a-z]+)(?:@\w+)?(?:\s+(.+))?$/i);

    if (command?.[1] === "start" || command?.[1] === "help") {
      await this.telegram.send({
        tenantId: access.tenantId,
        runId: `telegram-update-${update.update_id}`,
        chatId,
        text:
          "Telegram AI está listo. Enviá una consulta para crear un run. " +
          "Comandos: /status <run-id> y /cancel <run-id>.",
        idempotencyKey: `telegram-update:${update.update_id}:help`,
      });
      return;
    }

    if (command?.[1] === "status" && command[2]) {
      const run = await this.store.getRun(command[2].trim(), access.tenantId);
      await this.telegram.send({
        tenantId: access.tenantId,
        runId: run?.uuid ?? `telegram-update-${update.update_id}`,
        chatId,
        text: run ? `Run ${run.uuid}: ${run.status}.` : "Run no encontrado.",
        idempotencyKey: `telegram-update:${update.update_id}:status`,
      });
      return;
    }

    if (command?.[1] === "cancel" && command[2]) {
      const run = await this.store.requestCancellation(command[2].trim(), access.tenantId);
      await this.telegram.send({
        tenantId: access.tenantId,
        runId: run?.uuid ?? `telegram-update-${update.update_id}`,
        chatId,
        text: run ? `Cancelación registrada para ${run.uuid}.` : "Run no encontrado.",
        idempotencyKey: `telegram-update:${update.update_id}:cancel`,
      });
      return;
    }

    const conversationId = await this.store.telegramConversation(access, chatId);
    const run = await this.store.enqueue({
      tenantId: access.tenantId,
      actorId: access.actorId,
      actorRole: access.actorRole,
      request: {
        conversationId,
        task: text,
        manifest: "assistant",
        idempotencyKey: `telegram-update:${update.update_id}`,
        metadata: {
          channel: "telegram",
          telegramUserId: access.telegramUserId,
          telegramChatId: chatId,
          telegramMessageId: String(message.message_id),
          telegramUpdateId: String(update.update_id),
        },
      },
    });
    await this.telegram.send({
      tenantId: access.tenantId,
      runId: run.uuid,
      chatId,
      text: `Consulta recibida. Run ${run.uuid}.`,
      idempotencyKey: `telegram-run:${run.uuid}:accepted`,
    });
  }

  private async deliverRun(run: RunDocument): Promise<void> {
    const chatId = metadataValue(run, "telegramChatId");
    const telegramUserId = metadataValue(run, "telegramUserId");
    if (!chatId || !telegramUserId) return;
    const access = await this.store.findActiveTelegramAccess(telegramUserId);
    if (
      !access ||
      access.tenantId !== run.tenantId ||
      access.actorId !== run.actorId ||
      access.actorRole !== run.actorRole
    ) {
      await this.store.completeTelegramDelivery(run.uuid, "revoked");
      return;
    }

    if (run.status === "waiting") {
      const confirmation = await this.store.pendingConfirmation(run.uuid);
      if (!confirmation || run.telegramConfirmationNotifiedId === confirmation.uuid) return;
      await this.telegram.send({
        tenantId: run.tenantId,
        runId: run.uuid,
        chatId,
        text:
          `El run ${run.uuid} requiere confirmar ${confirmation.toolName}. ` +
          `Abrí el backoffice para aprobar o rechazar la operación.`,
        idempotencyKey: `telegram-run:${run.uuid}:confirmation:${confirmation.uuid}`,
      });
      await this.store.markTelegramConfirmationNotified(run.uuid, confirmation.uuid);
      return;
    }

    const parts = chunks(terminalMessage(run));
    for (const [index, text] of parts.entries()) {
      await this.telegram.send({
        tenantId: run.tenantId,
        runId: run.uuid,
        chatId,
        text,
        idempotencyKey: `telegram-run:${run.uuid}:terminal:${run.status}:${index}`,
      });
    }
    await this.store.completeTelegramDelivery(run.uuid, "sent");
  }

  private async retry(message: string, requestedDelayMs: number): Promise<void> {
    this.restartCount += 1;
    const delayMs = Math.min(
      Math.max(requestedDelayMs, this.config.telegram.backoffMinMs),
      this.config.telegram.backoffMaxMs,
    );
    const now = new Date();
    const nextRetryAt = new Date(now.getTime() + delayMs).toISOString();
    await this.store.setTelegramRuntimeStatus({
      enabled: true,
      state: "degraded",
      running: true,
      restartCount: this.restartCount,
      heartbeatAt: now.toISOString(),
      lastErrorAt: now.toISOString(),
      lastError: message.slice(0, 240),
      nextRetryAt,
    });
    console.warn("Telegram polling retry scheduled", {
      restartCount: this.restartCount,
      delayMs,
      nextRetryAt,
      reason: message.slice(0, 240),
    });
    await wait(delayMs, this.controller.signal);
  }
}

import { createHash } from "node:crypto";
import type { AgentConfig } from "@/config";
import type { AgentStore, DeliveryDocument } from "@/runtime/store/AgentStore";
import { sanitizedTelegramError, TelegramClient } from "@/telegram/TelegramClient";

export class TelegramService {
  private readonly client: TelegramClient;

  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
    client?: TelegramClient,
  ) {
    this.client = client ?? new TelegramClient(config);
  }

  async send(input: {
    tenantId: string;
    runId: string;
    chatId: string;
    text: string;
    idempotencyKey?: string;
    signal?: AbortSignal;
    assertActive?: () => Promise<void>;
  }): Promise<{ deliveryId: string; externalId: string }> {
    if (!this.config.telegram.botToken) {
      throw new Error("Telegram no está configurado.");
    }
    const idempotencyKey = createHash("sha256")
      .update(input.idempotencyKey ?? `${input.runId}:${input.chatId}:${input.text}`)
      .digest("hex");
    const existing = await this.store.deliveriesCollection.findOne({
      tenantId: input.tenantId,
      idempotencyKey,
    });
    if (existing?.status === "sent" && existing.externalId) {
      return { deliveryId: existing.uuid, externalId: existing.externalId };
    }
    if (existing) {
      throw new Error("El envío Telegram previo requiere reconciliación manual.");
    }

    const now = new Date().toISOString();
    const delivery: DeliveryDocument = {
      uuid: crypto.randomUUID(),
      tenantId: input.tenantId,
      runId: input.runId,
      provider: "telegram",
      idempotencyKey,
      status: "pending",
      externalId: null,
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.deliveriesCollection.insertOne(delivery);

    try {
      await input.assertActive?.();
      const externalId = await this.client.sendMessage(input.chatId, input.text, input.signal);
      await this.store.deliveriesCollection.updateOne(
        { uuid: delivery.uuid },
        {
          $set: {
            status: "sent",
            externalId,
            attempts: 1,
            lastError: null,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      return { deliveryId: delivery.uuid, externalId };
    } catch (cause) {
      const lastError = sanitizedTelegramError(
        cause,
        this.config.telegram.botToken,
        "Telegram delivery outcome uncertain",
      );
      await this.store.deliveriesCollection.updateOne(
        { uuid: delivery.uuid },
        {
          $set: {
            status: "failed",
            attempts: 1,
            lastError,
            updatedAt: new Date().toISOString(),
          },
        },
      );
      throw new Error(lastError);
    }
  }

  async previewDestination(input: { tenantId: string; destinationId: string; text: string }) {
    const access = await this.store.findActiveTelegramDestination(
      input.destinationId,
      input.tenantId,
    );
    if (!access) throw new Error("Destino Telegram no encontrado.");
    return {
      destinationId: access.uuid,
      destinationLabel: access.label,
      telegramUserId: access.telegramUserId,
      tenantId: access.tenantId,
      messagePreview: input.text.slice(0, 500),
    };
  }

  async sendToDestination(input: {
    tenantId: string;
    runId: string;
    destinationId: string;
    text: string;
    signal: AbortSignal;
    assertActive: () => Promise<void>;
  }): Promise<{ deliveryId: string; externalId: string }> {
    await input.assertActive();
    const access = await this.store.findActiveTelegramDestination(
      input.destinationId,
      input.tenantId,
    );
    if (!access) throw new Error("Destino Telegram no encontrado.");
    return this.send({
      tenantId: input.tenantId,
      runId: input.runId,
      chatId: access.telegramUserId,
      text: input.text,
      idempotencyKey: `${input.runId}:${input.destinationId}:${input.text}`,
      signal: input.signal,
      assertActive: input.assertActive,
    });
  }
}

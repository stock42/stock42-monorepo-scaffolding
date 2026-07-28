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

    const now = new Date().toISOString();
    const delivery: DeliveryDocument =
      existing ??
      ({
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
      } satisfies DeliveryDocument);
    if (!existing) await this.store.deliveriesCollection.insertOne(delivery);

    let lastError = "Telegram delivery failed";
    const lastAttempt = delivery.attempts + 3;
    for (let attempt = delivery.attempts + 1; attempt <= lastAttempt; attempt += 1) {
      try {
        const externalId = await this.client.sendMessage(input.chatId, input.text);
        await this.store.deliveriesCollection.updateOne(
          { uuid: delivery.uuid },
          {
            $set: {
              status: "sent",
              externalId,
              attempts: attempt,
              lastError: null,
              updatedAt: new Date().toISOString(),
            },
          },
        );
        return { deliveryId: delivery.uuid, externalId };
      } catch (cause) {
        lastError = sanitizedTelegramError(
          cause,
          this.config.telegram.botToken,
          "Telegram delivery failed",
        );
        await this.store.deliveriesCollection.updateOne(
          { uuid: delivery.uuid },
          {
            $set: {
              status: "failed",
              attempts: attempt,
              lastError,
              updatedAt: new Date().toISOString(),
            },
          },
        );
      }
    }
    throw new Error(lastError);
  }
}

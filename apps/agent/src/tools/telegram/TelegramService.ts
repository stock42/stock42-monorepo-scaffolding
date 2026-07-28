import { createHash } from "node:crypto";
import type { AgentConfig } from "@/config";
import type { AgentStore, DeliveryDocument } from "@/runtime/store/AgentStore";

export class TelegramService {
  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
  ) {}

  async send(input: {
    tenantId: string;
    runId: string;
    chatId: string;
    text: string;
  }): Promise<{ deliveryId: string; externalId: string }> {
    if (!this.config.telegramBotToken) {
      throw new Error("Telegram no está configurado.");
    }
    const idempotencyKey = createHash("sha256")
      .update(`${input.runId}:${input.chatId}:${input.text}`)
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
    for (let attempt = delivery.attempts + 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: input.chatId, text: input.text }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        const payload: unknown = await response.json();
        const externalId =
          typeof payload === "object" &&
          payload !== null &&
          "result" in payload &&
          typeof payload.result === "object" &&
          payload.result !== null &&
          "message_id" in payload.result
            ? String(payload.result.message_id)
            : null;
        if (!response.ok || !externalId) throw new Error("Telegram rejected delivery");
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
        lastError = cause instanceof Error ? cause.message : "Telegram delivery failed";
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

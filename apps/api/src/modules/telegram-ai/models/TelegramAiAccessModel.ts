import {
  TelegramAiAccessSchema,
  type TelegramAiAccess,
  type TelegramAiActorRole,
} from "@stock42/contracts/telegram-ai";

export type TelegramAiAccessDocument = TelegramAiAccess;

export class TelegramAiAccessModel {
  private data: TelegramAiAccessDocument;

  constructor(input: TelegramAiAccessDocument) {
    this.data = TelegramAiAccessSchema.parse(input);
  }

  static create(input: {
    telegramUserId: string;
    label: string;
    tenantId: string;
    actorId: string;
    actorRole: TelegramAiActorRole;
    actorDisplayName: string;
  }): TelegramAiAccessModel {
    const now = new Date().toISOString();
    return new TelegramAiAccessModel({
      uuid: crypto.randomUUID(),
      telegramUserId: input.telegramUserId.trim(),
      label: input.label.trim(),
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      actorDisplayName: input.actorDisplayName.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  get uuid() {
    return this.data.uuid;
  }

  get tenantId() {
    return this.data.tenantId;
  }

  get version() {
    return this.data.version;
  }

  update(input: { label: string; status: TelegramAiAccessDocument["status"] }): void {
    this.data.label = input.label.trim();
    this.data.status = input.status;
    this.data.updatedAt = new Date().toISOString();
    this.data.version += 1;
  }

  getData(): TelegramAiAccessDocument {
    return { ...this.data };
  }

  toPublic(): TelegramAiAccess {
    return TelegramAiAccessSchema.parse(this.data);
  }
}

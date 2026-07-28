import { TELEGRAM_AI_ACCESS_COLLECTION } from "@stock42/contracts/telegram-ai";
import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import {
  TelegramAiAccessModel,
  type TelegramAiAccessDocument,
} from "../models/TelegramAiAccessModel";

export { TELEGRAM_AI_ACCESS_COLLECTION };

export class TelegramAiAccessStorage extends MongoDBStorage<TelegramAiAccessDocument> {
  constructor(collection: Collection<TelegramAiAccessDocument>) {
    super(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex(
        { uuid: 1 },
        { unique: true, name: "telegram_ai_access_uuid_unique" },
      ),
      this.collection.createIndex(
        { telegramUserId: 1 },
        { unique: true, name: "telegram_ai_access_user_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, status: 1, uuid: 1 },
        { name: "telegram_ai_access_tenant_status_uuid" },
      ),
    ]);
  }

  async create(model: TelegramAiAccessModel): Promise<TelegramAiAccessModel> {
    return new TelegramAiAccessModel(await this.insert(model.getData()));
  }

  async list(tenantId: string, limit: number, cursor?: string): Promise<TelegramAiAccessModel[]> {
    const documents = await this.findBounded({ tenantId }, { limit, cursor });
    return documents.map((document) => new TelegramAiAccessModel(document));
  }

  async update(
    uuid: string,
    tenantId: string,
    input: { label: string; status: "active" | "inactive"; expectedVersion: number },
  ): Promise<TelegramAiAccessModel | null> {
    const current = await this.findOne({
      uuid,
      tenantId,
      version: input.expectedVersion,
    });
    if (!current) return null;
    const model = new TelegramAiAccessModel(current);
    model.update(input);
    const next = model.getData();
    const document = await this.collection.findOneAndUpdate(
      { uuid, tenantId, version: input.expectedVersion },
      {
        $set: {
          label: next.label,
          status: next.status,
          updatedAt: next.updatedAt,
          version: next.version,
        },
      },
      { returnDocument: "after" },
    );
    return document ? new TelegramAiAccessModel(document) : null;
  }

  async delete(uuid: string, tenantId: string, expectedVersion: number): Promise<boolean> {
    const result = await this.collection.deleteOne({ uuid, tenantId, version: expectedVersion });
    return result.deletedCount === 1;
  }
}

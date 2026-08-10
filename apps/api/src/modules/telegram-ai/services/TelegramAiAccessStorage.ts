import { TELEGRAM_AI_ACCESS_COLLECTION } from "@stock42/contracts/telegram-ai";
import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import {
  TelegramAiAccessModel,
  type TelegramAiAccessDocument,
} from "../models/TelegramAiAccessModel";

export { TELEGRAM_AI_ACCESS_COLLECTION };

export class TelegramAiAccessStorage extends MongoDBStorage {
  static readonly collectionName = TELEGRAM_AI_ACCESS_COLLECTION;

  private static get collection(): Collection<TelegramAiAccessDocument> {
    return this.getCollection<TelegramAiAccessDocument>(this.collectionName);
  }

  static async create(model: TelegramAiAccessModel): Promise<TelegramAiAccessModel> {
    return new TelegramAiAccessModel(await this.insert(this.collection, model.getData()));
  }

  static async list(
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<TelegramAiAccessModel[]> {
    const documents = await this.findBounded(this.collection, { tenantId }, { limit, cursor });
    return documents.map((document) => new TelegramAiAccessModel(document));
  }

  static async update(
    uuid: string,
    tenantId: string,
    input: { label: string; status: "active" | "inactive"; expectedVersion: number },
  ): Promise<TelegramAiAccessModel | null> {
    const current = await this.findOne(this.collection, {
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

  static async delete(uuid: string, tenantId: string, expectedVersion: number): Promise<boolean> {
    const result = await this.collection.deleteOne({ uuid, tenantId, version: expectedVersion });
    return result.deletedCount === 1;
  }
}

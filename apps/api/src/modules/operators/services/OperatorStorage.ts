import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { OperatorModel, type OperatorDocument } from "../models/OperatorModel";

export class OperatorStorage extends MongoDBStorage {
  static readonly collectionName = "operators";

  private static get collection(): Collection<OperatorDocument> {
    return this.getCollection<OperatorDocument>(this.collectionName);
  }

  static async create(model: OperatorModel): Promise<OperatorModel> {
    return new OperatorModel(await this.insert(this.collection, model.getData()));
  }

  static async findByUuid(uuid: string, tenantId: string): Promise<OperatorModel | null> {
    const document = await this.findOne(this.collection, { uuid, tenantId });
    return document ? new OperatorModel(document) : null;
  }

  static async findByEmail(tenantId: string, email: string): Promise<OperatorModel | null> {
    const document = await this.findOne(this.collection, {
      tenantId,
      email: email.trim().toLowerCase(),
    });
    return document ? new OperatorModel(document) : null;
  }

  static async list(tenantId: string, limit: number, cursor?: string): Promise<OperatorModel[]> {
    const documents = await this.findBounded(this.collection, { tenantId }, { limit, cursor });
    return documents.map((document) => new OperatorModel(document));
  }

  static async removeCreatedOwner(uuid: string, tenantId: string): Promise<void> {
    await this.collection.deleteOne({ uuid, tenantId, role: "owner" });
  }
}

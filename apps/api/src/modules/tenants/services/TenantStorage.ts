import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { TenantModel, type TenantDocument } from "../models/TenantModel";

export class TenantStorage extends MongoDBStorage {
  static readonly collectionName = "tenants";

  private static get collection(): Collection<TenantDocument> {
    return this.getCollection<TenantDocument>(this.collectionName);
  }

  static async create(model: TenantModel): Promise<TenantModel> {
    return new TenantModel(await this.insert(this.collection, model.getData()));
  }

  static async findByUuid(uuid: string): Promise<TenantModel | null> {
    const document = await this.findOne(this.collection, { uuid });
    return document ? new TenantModel(document) : null;
  }

  static async findBySlug(slug: string): Promise<TenantModel | null> {
    const document = await this.findOne(this.collection, { slug: slug.trim().toLowerCase() });
    return document ? new TenantModel(document) : null;
  }

  static async list(limit: number, cursor?: string): Promise<TenantModel[]> {
    const documents = await this.findBounded(this.collection, {}, { limit, cursor });
    return documents.map((document) => new TenantModel(document));
  }

  static async updateStatus(
    uuid: string,
    status: TenantDocument["status"],
    expectedVersion: number,
  ): Promise<TenantModel | null> {
    const result = await this.collection.findOneAndUpdate(
      { uuid, version: expectedVersion },
      {
        $set: { status, updatedAt: new Date().toISOString() },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    return result ? new TenantModel(result) : null;
  }
}

import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { TenantModel, type TenantDocument } from "../models/TenantModel";

export class TenantStorage extends MongoDBStorage<TenantDocument> {
  constructor(collection: Collection<TenantDocument>) {
    super(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ uuid: 1 }, { unique: true, name: "tenants_uuid_unique" }),
      this.collection.createIndex({ slug: 1 }, { unique: true, name: "tenants_slug_unique" }),
      this.collection.createIndex({ status: 1, uuid: 1 }, { name: "tenants_status_uuid" }),
    ]);
  }

  async create(model: TenantModel): Promise<TenantModel> {
    return new TenantModel(await this.insert(model.getData()));
  }

  async findByUuid(uuid: string): Promise<TenantModel | null> {
    const document = await this.findOne({ uuid });
    return document ? new TenantModel(document) : null;
  }

  async findBySlug(slug: string): Promise<TenantModel | null> {
    const document = await this.findOne({ slug: slug.trim().toLowerCase() });
    return document ? new TenantModel(document) : null;
  }

  async list(limit: number, cursor?: string): Promise<TenantModel[]> {
    const documents = await this.findBounded({}, { limit, cursor });
    return documents.map((document) => new TenantModel(document));
  }

  async updateStatus(
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

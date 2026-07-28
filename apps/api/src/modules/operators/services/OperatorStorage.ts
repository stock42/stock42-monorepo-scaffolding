import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { OperatorModel, type OperatorDocument } from "../models/OperatorModel";

export class OperatorStorage extends MongoDBStorage<OperatorDocument> {
  constructor(collection: Collection<OperatorDocument>) {
    super(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ uuid: 1 }, { unique: true, name: "operators_uuid_unique" }),
      this.collection.createIndex(
        { tenantId: 1, email: 1 },
        { unique: true, name: "operators_tenant_email_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, status: 1, uuid: 1 },
        { name: "operators_tenant_status_uuid" },
      ),
    ]);
  }

  async create(model: OperatorModel): Promise<OperatorModel> {
    return new OperatorModel(await this.insert(model.getData()));
  }

  async findByUuid(uuid: string, tenantId: string): Promise<OperatorModel | null> {
    const document = await this.findOne({ uuid, tenantId });
    return document ? new OperatorModel(document) : null;
  }

  async findByEmail(tenantId: string, email: string): Promise<OperatorModel | null> {
    const document = await this.findOne({
      tenantId,
      email: email.trim().toLowerCase(),
    });
    return document ? new OperatorModel(document) : null;
  }

  async list(tenantId: string, limit: number, cursor?: string): Promise<OperatorModel[]> {
    const documents = await this.findBounded({ tenantId }, { limit, cursor });
    return documents.map((document) => new OperatorModel(document));
  }

  async removeCreatedOwner(uuid: string, tenantId: string): Promise<void> {
    await this.collection.deleteOne({ uuid, tenantId, role: "owner" });
  }
}

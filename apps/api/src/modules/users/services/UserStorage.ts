import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { UserModel, type UserDocument } from "../models/UserModel";

export class UserStorage extends MongoDBStorage<UserDocument> {
  constructor(collection: Collection<UserDocument>) {
    super(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ uuid: 1 }, { unique: true, name: "users_uuid_unique" }),
      this.collection.createIndex(
        { tenantId: 1, email: 1 },
        { unique: true, name: "users_tenant_email_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, status: 1, uuid: 1 },
        { name: "users_tenant_status_uuid" },
      ),
    ]);
  }

  async create(model: UserModel): Promise<UserModel> {
    return new UserModel(await this.insert(model.getData()));
  }

  async findByUuid(uuid: string, tenantId: string): Promise<UserModel | null> {
    const document = await this.findOne({ uuid, tenantId });
    return document ? new UserModel(document) : null;
  }

  async findByEmail(tenantId: string, email: string): Promise<UserModel | null> {
    const document = await this.findOne({
      tenantId,
      email: email.trim().toLowerCase(),
    });
    return document ? new UserModel(document) : null;
  }

  async list(tenantId: string, limit: number, cursor?: string): Promise<UserModel[]> {
    const documents = await this.findBounded({ tenantId }, { limit, cursor });
    return documents.map((document) => new UserModel(document));
  }
}

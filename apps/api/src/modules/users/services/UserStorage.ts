import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { UserModel, type UserDocument } from "../models/UserModel";

export class UserStorage extends MongoDBStorage {
  static readonly collectionName = "users";

  private static get collection(): Collection<UserDocument> {
    return this.getCollection<UserDocument>(this.collectionName);
  }

  static async create(model: UserModel): Promise<UserModel> {
    return new UserModel(await this.insert(this.collection, model.getData()));
  }

  static async findByUuid(uuid: string, tenantId: string): Promise<UserModel | null> {
    const document = await this.findOne(this.collection, { uuid, tenantId });
    return document ? new UserModel(document) : null;
  }

  static async findByEmail(tenantId: string, email: string): Promise<UserModel | null> {
    const document = await this.findOne(this.collection, {
      tenantId,
      email: email.trim().toLowerCase(),
    });
    return document ? new UserModel(document) : null;
  }

  static async list(tenantId: string, limit: number, cursor?: string): Promise<UserModel[]> {
    const documents = await this.findBounded(this.collection, { tenantId }, { limit, cursor });
    return documents.map((document) => new UserModel(document));
  }

  static async findActiveByUuids(tenantId: string, uuids: string[]): Promise<UserModel[]> {
    if (uuids.length === 0) return [];
    const documents = await this.collection
      .find({ tenantId, uuid: { $in: [...new Set(uuids)] }, status: "active" })
      .sort({ uuid: 1 })
      .limit(5_000)
      .toArray();
    return documents.map((document) => new UserModel(document));
  }
}

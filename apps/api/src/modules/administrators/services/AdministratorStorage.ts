import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { AdministratorModel, type AdministratorDocument } from "../models/AdministratorModel";

export class AdministratorStorage extends MongoDBStorage<AdministratorDocument> {
  constructor(collection: Collection<AdministratorDocument>) {
    super(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex(
        { uuid: 1 },
        { unique: true, name: "administrators_uuid_unique" },
      ),
      this.collection.createIndex(
        { email: 1 },
        { unique: true, name: "administrators_email_unique" },
      ),
    ]);
  }

  async create(model: AdministratorModel): Promise<AdministratorModel> {
    return new AdministratorModel(await this.insert(model.getData()));
  }

  async findByEmail(email: string): Promise<AdministratorModel | null> {
    const document = await this.findOne({ email: email.trim().toLowerCase() });
    return document ? new AdministratorModel(document) : null;
  }

  async findByUuid(uuid: string): Promise<AdministratorModel | null> {
    const document = await this.findOne({ uuid });
    return document ? new AdministratorModel(document) : null;
  }
}

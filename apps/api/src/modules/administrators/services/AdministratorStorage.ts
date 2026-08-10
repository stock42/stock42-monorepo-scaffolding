import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";
import { AdministratorModel, type AdministratorDocument } from "../models/AdministratorModel";

export class AdministratorStorage extends MongoDBStorage {
  static readonly collectionName = "administrators";

  private static get collection(): Collection<AdministratorDocument> {
    return this.getCollection<AdministratorDocument>(this.collectionName);
  }

  static async create(model: AdministratorModel): Promise<AdministratorModel> {
    return new AdministratorModel(await this.insert(this.collection, model.getData()));
  }

  static async findByEmail(email: string): Promise<AdministratorModel | null> {
    const document = await this.findOne(this.collection, {
      email: email.trim().toLowerCase(),
    });
    return document ? new AdministratorModel(document) : null;
  }

  static async findByUuid(uuid: string): Promise<AdministratorModel | null> {
    const document = await this.findOne(this.collection, { uuid });
    return document ? new AdministratorModel(document) : null;
  }
}

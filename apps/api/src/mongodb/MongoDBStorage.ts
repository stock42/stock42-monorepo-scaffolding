import type { Collection, Document, Filter, OptionalUnlessRequiredId } from "mongodb";
import { Dependencies, type MongoClient } from "s42-core";

export type FlatDocument = Document & {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export abstract class MongoDBStorage {
  protected static getCollection<TDocument extends Document>(
    collectionName: string,
  ): Collection<TDocument> {
    const db = Dependencies.get<MongoClient>("db");
    if (!db) throw new Error("db dependency is not registered");
    return db.getCollection<TDocument>(collectionName);
  }

  protected static async insert<TDocument extends FlatDocument>(
    collection: Collection<TDocument>,
    document: TDocument,
  ): Promise<TDocument> {
    await collection.insertOne(document as OptionalUnlessRequiredId<TDocument>);
    return document;
  }

  protected static async findOne<TDocument extends FlatDocument>(
    collection: Collection<TDocument>,
    filter: Filter<TDocument>,
  ): Promise<TDocument | null> {
    const document = await collection.findOne(filter);
    if (!document) return null;
    const value = { ...document } as Record<string, unknown>;
    delete value._id;
    return value as unknown as TDocument;
  }

  protected static async findBounded<TDocument extends FlatDocument>(
    collection: Collection<TDocument>,
    filter: Filter<TDocument>,
    options: { limit: number; cursor?: string },
  ): Promise<TDocument[]> {
    const boundedLimit = Math.min(Math.max(options.limit, 1), 100);
    const cursorFilter = options.cursor
      ? ({ uuid: { $gt: options.cursor } } as Filter<TDocument>)
      : {};
    const documents = await collection
      .find({ $and: [filter, cursorFilter] } as Filter<TDocument>)
      .sort({ uuid: 1 })
      .limit(boundedLimit)
      .toArray();
    return documents.map((document) => {
      const value = { ...document } as Record<string, unknown>;
      delete value._id;
      return value as unknown as TDocument;
    });
  }
}

import type { Collection, Document, Filter, OptionalUnlessRequiredId } from "mongodb";

export type FlatDocument = Document & {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export class MongoDBStorage<TDocument extends FlatDocument> {
  constructor(protected readonly collection: Collection<TDocument>) {}

  protected async insert(document: TDocument): Promise<TDocument> {
    await this.collection.insertOne(document as OptionalUnlessRequiredId<TDocument>);
    return document;
  }

  protected async findOne(filter: Filter<TDocument>): Promise<TDocument | null> {
    const document = await this.collection.findOne(filter);
    if (!document) return null;
    const value = { ...document } as Record<string, unknown>;
    delete value._id;
    return value as unknown as TDocument;
  }

  protected async findBounded(
    filter: Filter<TDocument>,
    options: { limit: number; cursor?: string },
  ): Promise<TDocument[]> {
    const boundedLimit = Math.min(Math.max(options.limit, 1), 100);
    const cursorFilter = options.cursor
      ? ({ uuid: { $gt: options.cursor } } as Filter<TDocument>)
      : {};
    const documents = await this.collection
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

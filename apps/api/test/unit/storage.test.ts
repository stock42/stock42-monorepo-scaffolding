import { afterEach, describe, expect, test } from "bun:test";
import { Dependencies, type MongoClient } from "s42-core";
import { ensureRequiredIndexes } from "@/boot/indexes";

describe("static Mongo storage boot", () => {
  afterEach(() => Dependencies.clear());

  test("requires the registered db dependency", async () => {
    await expect(ensureRequiredIndexes()).rejects.toThrow("db dependency is not registered");
  });

  test("ensures every API index from the centralized boot function", async () => {
    const collections: string[] = [];
    const indexNames: string[] = [];
    const db = {
      getCollection(collectionName: string) {
        return {
          async createIndexes(indexes: Array<{ name: string }>) {
            collections.push(collectionName);
            indexNames.push(...indexes.map((index) => index.name));
            return indexes.map((index) => index.name);
          },
        };
      },
    } as unknown as MongoClient;
    Dependencies.add<MongoClient>("db", db);

    await ensureRequiredIndexes();

    expect(new Set(collections).size).toBe(13);
    expect(indexNames).toHaveLength(35);
    expect(new Set(indexNames).size).toBe(indexNames.length);
    expect(indexNames).toContain("administrators_email_unique");
    expect(indexNames).toContain("email_spooler_due");
    expect(indexNames).toContain("ws_ticket_expiry_ttl");
  });
});

import type { Collection } from "mongodb";
import type { AppContext } from "@/context";

type MigrationDocument = {
  id: string;
  appliedAt: string;
};

type Migration = {
  id: string;
  run: (context: AppContext) => Promise<void>;
};

const migrations: Migration[] = [
  {
    id: "0001-flat-document-baseline",
    async run() {
      // The baseline is represented by the centralized boot indexes; no data rewrite is needed.
    },
  },
];

export async function runMigrations(context: AppContext): Promise<void> {
  const collection: Collection<MigrationDocument> =
    context.mongo.getCollection<MigrationDocument>("migrations");

  for (const migration of migrations) {
    if (await collection.findOne({ id: migration.id })) continue;
    await migration.run(context);
    await collection.updateOne(
      { id: migration.id },
      { $setOnInsert: { id: migration.id, appliedAt: new Date().toISOString() } },
      { upsert: true },
    );
  }
}

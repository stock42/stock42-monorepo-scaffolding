import { CreateAdministratorInputSchema } from "@stock42/contracts/tenancy";
import { Dependencies, MongoClient } from "s42-core";
import { ensureRequiredIndexes } from "@/boot/indexes";
import { AdministratorModel } from "@/modules/administrators/models/AdministratorModel";
import { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";

const input = CreateAdministratorInputSchema.parse({
  email: Bun.env.ADMIN_EMAIL,
  displayName: Bun.env.ADMIN_NAME,
  password: Bun.env.ADMIN_PASSWORD,
});
const uri = Bun.env.MONGODB_URI;
const database = Bun.env.MONGODB_DB;
if (!uri || !database) {
  throw new Error("MONGODB_URI y MONGODB_DB son obligatorios.");
}

const mongo = MongoClient.getInstance({ connectionString: uri, database });
await mongo.connect();
try {
  Dependencies.add<MongoClient>("db", mongo);
  await ensureRequiredIndexes();
  const existing = await AdministratorStorage.findByEmail(input.email);
  if (existing) throw new Error("El administrador ya existe.");
  const created = await AdministratorStorage.create(
    AdministratorModel.create({
      email: input.email,
      displayName: input.displayName,
      passwordHash: await Bun.password.hash(input.password),
    }),
  );
  console.info("Administrador creado", {
    uuid: created.uuid,
    email: created.email,
  });
} finally {
  await mongo.close();
  Dependencies.clear();
}

import type { ApiConfig } from "@/config";
import { AdministratorModel } from "@/modules/administrators/models/AdministratorModel";
import type { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";

type DefaultAdministratorStorage = Pick<AdministratorStorage, "create" | "findByEmail">;

export async function ensureDefaultAdministrator(
  config: NonNullable<ApiConfig["defaultAdministrator"]>,
  storage: DefaultAdministratorStorage,
): Promise<"created" | "existing"> {
  const existing = await storage.findByEmail(config.email);
  if (existing) {
    console.info("Default administrator already exists", {
      uuid: existing.uuid,
      email: existing.email,
    });
    return "existing";
  }

  const model = AdministratorModel.create({
    email: config.email,
    displayName: "Administrador principal",
    passwordHash: await Bun.password.hash(config.password),
  });

  try {
    const created = await storage.create(model);
    console.info("Default administrator created", {
      uuid: created.uuid,
      email: created.email,
    });
    return "created";
  } catch (cause) {
    const concurrent = await storage.findByEmail(config.email);
    if (!concurrent) throw cause;
    console.info("Default administrator already exists", {
      uuid: concurrent.uuid,
      email: concurrent.email,
    });
    return "existing";
  }
}

import { describe, expect, test } from "bun:test";
import { ensureDefaultAdministrator } from "@/boot/default-administrator";
import { AdministratorModel } from "@/modules/administrators/models/AdministratorModel";

const config = {
  email: "ADMIN@EXAMPLE.COM",
  password: "a-secure-password",
};

class AdministratorMemoryStorage {
  created: AdministratorModel | null = null;
  createCalls = 0;

  constructor(private existing: AdministratorModel | null = null) {}

  async findByEmail(email: string): Promise<AdministratorModel | null> {
    const administrator = this.created ?? this.existing;
    return administrator?.email === email.trim().toLowerCase() ? administrator : null;
  }

  async create(model: AdministratorModel): Promise<AdministratorModel> {
    this.createCalls += 1;
    this.created = model;
    return model;
  }
}

describe("default administrator boot", () => {
  test("creates the configured administrator when it does not exist", async () => {
    const storage = new AdministratorMemoryStorage();

    expect(await ensureDefaultAdministrator(config, storage)).toBe("created");
    expect(storage.createCalls).toBe(1);
    expect(storage.created?.email).toBe("admin@example.com");
    expect(storage.created?.getData().displayName).toBe("Administrador principal");
    expect(storage.created?.getData().status).toBe("active");
    expect(await Bun.password.verify(config.password, storage.created?.passwordHash ?? "")).toBe(
      true,
    );
    expect(storage.created?.passwordHash).not.toBe(config.password);
  });

  test("does not overwrite an existing administrator", async () => {
    const existing = AdministratorModel.create({
      email: config.email,
      displayName: "Nombre existente",
      passwordHash: await Bun.password.hash("existing-password"),
    });
    existing.setStatus("inactive");
    const before = existing.getData();
    const storage = new AdministratorMemoryStorage(existing);

    expect(await ensureDefaultAdministrator(config, storage)).toBe("existing");
    expect(storage.createCalls).toBe(0);
    expect(existing.getData()).toEqual(before);
    expect(await Bun.password.verify("existing-password", existing.passwordHash)).toBe(true);
    expect(await Bun.password.verify(config.password, existing.passwordHash)).toBe(false);
  });
});

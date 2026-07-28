import { describe, expect, test } from "bun:test";
import { TenantModel } from "@/modules/tenants/models/TenantModel";
import { UserModel } from "@/modules/users/models/UserModel";

describe("flat models", () => {
  test("serializes a tenant without historical envelope", () => {
    const tenant = TenantModel.create({
      name: "Acme",
      slug: "ACME",
      ownerOperatorId: crypto.randomUUID(),
    });
    const document = tenant.getData();

    expect(document.slug).toBe("acme");
    expect(document.version).toBe(1);
    expect(document).not.toHaveProperty("data");
    expect(document).not.toHaveProperty("_v");
  });

  test("normalizes user email and protects password hash from public output", () => {
    const user = UserModel.create({
      tenantId: crypto.randomUUID(),
      email: " USER@EXAMPLE.COM ",
      displayName: "User",
      passwordHash: "hash",
    });

    expect(user.email).toBe("user@example.com");
    expect(user.toPublic()).not.toHaveProperty("passwordHash");
  });
});

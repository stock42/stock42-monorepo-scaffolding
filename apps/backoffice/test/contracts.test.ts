import { describe, expect, test } from "bun:test";
import { CreateTenantInputSchema } from "@stock42/contracts/tenancy";

describe("backoffice contracts", () => {
  test("rejects a tenant without owner credentials", () => {
    expect(
      CreateTenantInputSchema.safeParse({
        name: "Acme",
        slug: "acme",
      }).success,
    ).toBe(false);
  });
});

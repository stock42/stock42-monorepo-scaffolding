import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_ENABLED !== "true",
  "Requiere E2E_ENABLED=true y la base Mongo configurada.",
);

test("un administrador accede al directorio de tenants", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL ?? "");
  await page.getByLabel("Contraseña").fill(process.env.E2E_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Abrir control" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Tenants" }).click();
  await expect(page.getByRole("heading", { name: "Directorio de tenants" })).toBeVisible();
});

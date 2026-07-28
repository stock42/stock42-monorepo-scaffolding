import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_ENABLED !== "true",
  "Requiere E2E_ENABLED=true y la base Mongo configurada.",
);

test("un usuario inicia y cierra sesión", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Organización").fill(process.env.E2E_TENANT_SLUG ?? "");
  await page.getByLabel("Email").fill(process.env.E2E_USER_EMAIL ?? "");
  await page.getByLabel("Contraseña").fill(process.env.E2E_USER_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar al workspace" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("TENANT CONNECTED")).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

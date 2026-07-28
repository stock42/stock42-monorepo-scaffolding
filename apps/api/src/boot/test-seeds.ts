import type { AppContext } from "@/context";

export async function runTestSeeds(context: AppContext): Promise<void> {
  if (!context.config.testing.seeds) return;
  if (!context.config.testing.enabled || !context.config.testing.tenantId) {
    throw new Error("API_TEST_SEEDS requiere API_TEST_ENABLED=true y TEST_TENANT_ID existente.");
  }

  console.info("Test seeds habilitados", {
    tenantId: context.config.testing.tenantId,
    note: "El scaffold no crea identidades de negocio implícitas.",
  });
}

import type { SessionActor } from "@stock42/contracts/auth";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { requireTenantManager } from "@/security/authorization";

export async function requireMarketingTenant(actor: SessionActor, tenantId: string): Promise<void> {
  requireTenantManager(actor, tenantId);
  const tenant = await getAppContext().storages.tenants.findByUuid(tenantId);
  if (!tenant || tenant.toPublic().status !== "active") {
    throw new HttpError(404, "NOT_FOUND", "Tenant activo no encontrado.");
  }
}

import type { SessionActor } from "@stock42/contracts/auth";
import { HttpError } from "@/errors/HttpError";
import { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import { requireTenantManager } from "@/security/authorization";

export async function requireMarketingTenant(actor: SessionActor, tenantId: string): Promise<void> {
  requireTenantManager(actor, tenantId);
  const tenant = await TenantStorage.findByUuid(tenantId);
  if (!tenant || tenant.toPublic().status !== "active") {
    throw new HttpError(404, "NOT_FOUND", "Tenant activo no encontrado.");
  }
}

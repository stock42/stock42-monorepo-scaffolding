import type { SessionActor } from "@stock42/contracts/auth";
import { UuidSchema } from "@stock42/contracts/common";
import { HttpError } from "@/errors/HttpError";
import { requireTenantAccess } from "@/security/authorization";

export function resolveAgentTenant(actor: SessionActor, requestedTenantId: unknown): string {
  const requested = requestedTenantId ? UuidSchema.parse(requestedTenantId) : undefined;
  const tenantId = actor.tenantId ?? requested;
  if (!tenantId) {
    throw new HttpError(400, "BAD_REQUEST", "Seleccioná el tenant para ejecutar el agente.");
  }
  requireTenantAccess(actor, tenantId);
  if (actor.tenantId && requested && requested !== actor.tenantId) {
    throw new HttpError(403, "FORBIDDEN", "El recurso pertenece a otro tenant.");
  }
  return tenantId;
}

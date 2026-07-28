import type { SessionActor } from "@stock42/contracts/auth";
import { HttpError } from "@/errors/HttpError";

export function requirePlatformAdministrator(actor: SessionActor): void {
  if (actor.role !== "platform_admin") {
    throw new HttpError(403, "FORBIDDEN", "Se requiere administración de plataforma.");
  }
}

export function requireTenantAccess(actor: SessionActor, tenantId: string): void {
  if (actor.role === "platform_admin") return;
  if (!actor.tenantId || actor.tenantId !== tenantId) {
    throw new HttpError(403, "FORBIDDEN", "El recurso pertenece a otro tenant.");
  }
}

export function requireTenantManager(actor: SessionActor, tenantId: string): void {
  requireTenantAccess(actor, tenantId);
  if (!["platform_admin", "tenant_owner"].includes(actor.role)) {
    throw new HttpError(403, "FORBIDDEN", "Se requiere ownership del tenant.");
  }
}

import type { ActorRole } from "@stock42/contracts/auth";

export type ResourceActor = {
  actorId: string;
  actorRole: ActorRole;
};

export function managesTenantResources(role: ActorRole): boolean {
  return role === "platform_admin" || role === "tenant_owner";
}

export function canAccessOwnedResource(ownerId: string, actor: ResourceActor): boolean {
  return ownerId === actor.actorId || managesTenantResources(actor.actorRole);
}

export function ownerFilter(
  field: "actorId" | "ownerId",
  actor: ResourceActor,
): Record<string, string> {
  return managesTenantResources(actor.actorRole) ? {} : { [field]: actor.actorId };
}

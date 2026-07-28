import type { SessionActor } from "@stock42/contracts/auth";
import type { Collection } from "mongodb";

type AuditDocument = {
  uuid: string;
  tenantId: string | null;
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export class AuditService {
  constructor(private readonly collection: Collection<AuditDocument>) {}

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ uuid: 1 }, { unique: true, name: "audit_uuid_unique" }),
      this.collection.createIndex({ tenantId: 1, createdAt: -1 }, { name: "audit_tenant_created" }),
      this.collection.createIndex({ actorId: 1, createdAt: -1 }, { name: "audit_actor_created" }),
    ]);
  }

  async record(
    actor: SessionActor,
    action: string,
    target: { type: string; id: string },
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.collection.insertOne({
      uuid: crypto.randomUUID(),
      tenantId: actor.tenantId,
      actorId: actor.uuid,
      actorRole: actor.role,
      action,
      targetType: target.type,
      targetId: target.id,
      metadata,
      createdAt: new Date().toISOString(),
    });
  }
}

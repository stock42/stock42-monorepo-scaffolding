import type { SessionActor } from "@stock42/contracts/auth";
import type { Collection } from "mongodb";
import { MongoDBStorage } from "@/mongodb/MongoDBStorage";

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

export class AuditService extends MongoDBStorage {
  static readonly collectionName = "audit_events";

  private static get collection(): Collection<AuditDocument> {
    return this.getCollection<AuditDocument>(this.collectionName);
  }

  static async record(
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

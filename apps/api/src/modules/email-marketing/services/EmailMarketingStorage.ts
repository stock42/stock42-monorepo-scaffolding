import {
  EMAIL_CAMPAIGNS_COLLECTION,
  EMAIL_SPOOLER_COLLECTION,
  EMAIL_TEMPLATES_COLLECTION,
  USER_GROUP_MEMBERS_COLLECTION,
  USER_GROUPS_COLLECTION,
  type EmailCampaignStatus,
  type EmailCampaignSummary,
  type EmailSpoolerStatus,
} from "@stock42/contracts/email-marketing";
import type { Collection, Filter } from "mongodb";
import { MongoDBStorage, type FlatDocument } from "@/mongodb/MongoDBStorage";

export type UserGroupDocument = FlatDocument & {
  tenantId: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  memberCount: number;
};

export type UserGroupMemberDocument = FlatDocument & {
  tenantId: string;
  groupId: string;
  userId: string;
};

export type EmailTemplateDocument = FlatDocument & {
  tenantId: string;
  name: string;
  subject: string;
  body: string;
  status: "active" | "inactive";
};

export type EmailCampaignDocument = FlatDocument & {
  tenantId: string;
  name: string;
  templateId: string;
  groupId: string;
  status: EmailCampaignStatus;
  scheduledAt: string;
  stoppedAt: string | null;
  idempotencyKey: string;
};

export type EmailSpoolerDocument = FlatDocument & {
  tenantId: string;
  campaignId: string;
  templateId: string;
  userId: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  status: EmailSpoolerStatus;
  scheduledAt: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  ready: boolean;
};

function withoutMongoId<T extends object>(document: T): T {
  const value = { ...document } as T & { _id?: unknown };
  delete value._id;
  return value;
}

export class UserGroupStorage extends MongoDBStorage<UserGroupDocument> {
  constructor(
    collection: Collection<UserGroupDocument>,
    private readonly members: Collection<UserGroupMemberDocument>,
  ) {
    super(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ uuid: 1 }, { unique: true, name: "user_groups_uuid_unique" }),
      this.collection.createIndex(
        { tenantId: 1, name: 1 },
        { unique: true, name: "user_groups_tenant_name_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, status: 1, uuid: 1 },
        { name: "user_groups_tenant_status_uuid" },
      ),
      this.members.createIndex(
        { tenantId: 1, groupId: 1, userId: 1 },
        { unique: true, name: "user_group_members_unique" },
      ),
      this.members.createIndex(
        { tenantId: 1, groupId: 1, uuid: 1 },
        { name: "user_group_members_group_uuid" },
      ),
    ]);
  }

  async create(document: UserGroupDocument): Promise<UserGroupDocument> {
    return this.insert(document);
  }

  async findByUuid(uuid: string, tenantId: string): Promise<UserGroupDocument | null> {
    return this.findOne({ uuid, tenantId });
  }

  async list(tenantId: string, limit: number, cursor?: string): Promise<UserGroupDocument[]> {
    return this.findBounded({ tenantId }, { limit, cursor });
  }

  async update(
    uuid: string,
    tenantId: string,
    input: Pick<UserGroupDocument, "name" | "description" | "status"> & {
      expectedVersion: number;
    },
  ): Promise<UserGroupDocument | null> {
    const now = new Date().toISOString();
    const document = await this.collection.findOneAndUpdate(
      { uuid, tenantId, version: input.expectedVersion },
      {
        $set: {
          name: input.name,
          description: input.description,
          status: input.status,
          updatedAt: now,
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    return document ? withoutMongoId(document) : null;
  }

  async addMembers(tenantId: string, groupId: string, userIds: string[]): Promise<number> {
    if (userIds.length === 0) return this.refreshMemberCount(tenantId, groupId);
    const now = new Date().toISOString();
    await this.members.bulkWrite(
      [...new Set(userIds)].map((userId) => ({
        updateOne: {
          filter: { tenantId, groupId, userId },
          update: {
            $setOnInsert: {
              uuid: crypto.randomUUID(),
              tenantId,
              groupId,
              userId,
              createdAt: now,
              updatedAt: now,
              version: 1,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return this.refreshMemberCount(tenantId, groupId);
  }

  async removeMember(tenantId: string, groupId: string, userId: string): Promise<number> {
    await this.members.deleteOne({ tenantId, groupId, userId });
    return this.refreshMemberCount(tenantId, groupId);
  }

  async listMemberIds(
    tenantId: string,
    groupId: string,
    limit: number,
    cursor?: string,
  ): Promise<string[]> {
    const filter: Filter<UserGroupMemberDocument> = { tenantId, groupId };
    if (cursor) filter.userId = { $gt: cursor };
    const documents = await this.members
      .find(filter)
      .sort({ userId: 1 })
      .limit(Math.min(Math.max(limit, 1), 5_000))
      .toArray();
    return documents.map((document) => document.userId);
  }

  private async refreshMemberCount(tenantId: string, groupId: string): Promise<number> {
    const memberCount = await this.members.countDocuments({ tenantId, groupId });
    await this.collection.updateOne(
      { uuid: groupId, tenantId },
      { $set: { memberCount, updatedAt: new Date().toISOString() } },
    );
    return memberCount;
  }
}

export class EmailTemplateStorage extends MongoDBStorage<EmailTemplateDocument> {
  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex(
        { uuid: 1 },
        { unique: true, name: "email_templates_uuid_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, name: 1 },
        { unique: true, name: "email_templates_tenant_name_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, status: 1, uuid: 1 },
        { name: "email_templates_tenant_status_uuid" },
      ),
    ]);
  }

  async create(document: EmailTemplateDocument): Promise<EmailTemplateDocument> {
    return this.insert(document);
  }

  async findByUuid(uuid: string, tenantId: string): Promise<EmailTemplateDocument | null> {
    return this.findOne({ uuid, tenantId });
  }

  async list(tenantId: string, limit: number, cursor?: string): Promise<EmailTemplateDocument[]> {
    return this.findBounded({ tenantId }, { limit, cursor });
  }

  async update(
    uuid: string,
    tenantId: string,
    input: Pick<EmailTemplateDocument, "name" | "subject" | "body" | "status"> & {
      expectedVersion: number;
    },
  ): Promise<EmailTemplateDocument | null> {
    const { expectedVersion, ...changes } = input;
    const document = await this.collection.findOneAndUpdate(
      { uuid, tenantId, version: expectedVersion },
      {
        $set: { ...changes, updatedAt: new Date().toISOString() },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    return document ? withoutMongoId(document) : null;
  }
}

export class EmailCampaignStorage extends MongoDBStorage<EmailCampaignDocument> {
  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex(
        { uuid: 1 },
        { unique: true, name: "email_campaigns_uuid_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, idempotencyKey: 1 },
        { unique: true, name: "email_campaigns_tenant_idempotency_unique" },
      ),
      this.collection.createIndex(
        { tenantId: 1, status: 1, uuid: 1 },
        { name: "email_campaigns_tenant_status_uuid" },
      ),
    ]);
  }

  async create(document: EmailCampaignDocument): Promise<EmailCampaignDocument> {
    return this.insert(document);
  }

  async findByUuid(uuid: string, tenantId: string): Promise<EmailCampaignDocument | null> {
    return this.findOne({ uuid, tenantId });
  }

  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<EmailCampaignDocument | null> {
    return this.findOne({ tenantId, idempotencyKey });
  }

  async list(tenantId: string, limit: number, cursor?: string): Promise<EmailCampaignDocument[]> {
    return this.findBounded({ tenantId }, { limit, cursor });
  }

  async setStatus(
    uuid: string,
    tenantId: string,
    status: EmailCampaignStatus,
    stoppedAt: string | null = null,
  ): Promise<EmailCampaignDocument | null> {
    const document = await this.collection.findOneAndUpdate(
      { uuid, tenantId },
      {
        $set: { status, stoppedAt, updatedAt: new Date().toISOString() },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    return document ? withoutMongoId(document) : null;
  }
}

export class EmailSpoolerStorage extends MongoDBStorage<EmailSpoolerDocument> {
  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ uuid: 1 }, { unique: true, name: "email_spooler_uuid_unique" }),
      this.collection.createIndex(
        { campaignId: 1, userId: 1 },
        { unique: true, name: "email_spooler_campaign_user_unique" },
      ),
      this.collection.createIndex(
        { ready: 1, status: 1, scheduledAt: 1, uuid: 1 },
        { name: "email_spooler_due" },
      ),
      this.collection.createIndex(
        { tenantId: 1, campaignId: 1, status: 1 },
        { name: "email_spooler_tenant_campaign_status" },
      ),
    ]);
  }

  async createMany(documents: EmailSpoolerDocument[]): Promise<void> {
    if (documents.length > 0) await this.collection.insertMany(documents, { ordered: true });
  }

  async activateCampaignEntries(tenantId: string, campaignId: string): Promise<number> {
    const result = await this.collection.updateMany(
      { tenantId, campaignId, ready: false },
      { $set: { ready: true, updatedAt: new Date().toISOString() }, $inc: { version: 1 } },
    );
    return result.modifiedCount;
  }

  async findByUuid(uuid: string, tenantId: string): Promise<EmailSpoolerDocument | null> {
    return this.findOne({ uuid, tenantId });
  }

  async list(
    tenantId: string,
    limit: number,
    cursor?: string,
    filters: { campaignId?: string; status?: EmailSpoolerStatus } = {},
  ): Promise<EmailSpoolerDocument[]> {
    const filter: Filter<EmailSpoolerDocument> = { tenantId };
    if (filters.campaignId) filter.campaignId = filters.campaignId;
    if (filters.status) filter.status = filters.status;
    return this.findBounded(filter, { limit, cursor });
  }

  async claimDue(now: string, leaseMs: number): Promise<EmailSpoolerDocument | null> {
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
    const document = await this.collection.findOneAndUpdate(
      {
        ready: true,
        scheduledAt: { $lte: now },
        $or: [{ status: "pending" }, { status: "processing", leaseExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: "processing",
          leaseToken,
          leaseExpiresAt,
          updatedAt: now,
        },
        $inc: { attempts: 1, version: 1 },
      },
      { sort: { scheduledAt: 1, uuid: 1 }, returnDocument: "after" },
    );
    return document ? withoutMongoId(document) : null;
  }

  async markSent(document: EmailSpoolerDocument, sentAt: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { uuid: document.uuid, status: "processing", leaseToken: document.leaseToken },
      {
        $set: {
          status: "sent",
          sentAt,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: sentAt,
        },
        $inc: { version: 1 },
      },
    );
    return result.modifiedCount === 1;
  }

  async markFailed(
    document: EmailSpoolerDocument,
    error: string,
    retryAt: string | null,
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { uuid: document.uuid, status: "processing", leaseToken: document.leaseToken },
      {
        $set: {
          status: retryAt ? "pending" : "failed",
          scheduledAt: retryAt ?? document.scheduledAt,
          lastError: error.slice(0, 1_000),
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      },
    );
    return result.modifiedCount === 1;
  }

  async scheduleNow(uuid: string, tenantId: string): Promise<EmailSpoolerDocument | null> {
    const now = new Date().toISOString();
    const document = await this.collection.findOneAndUpdate(
      { uuid, tenantId, status: { $in: ["pending", "failed"] } },
      {
        $set: {
          status: "pending",
          scheduledAt: now,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    return document ? withoutMongoId(document) : null;
  }

  async stop(uuid: string, tenantId: string): Promise<EmailSpoolerDocument | null> {
    const document = await this.collection.findOneAndUpdate(
      { uuid, tenantId, status: { $in: ["pending", "failed"] } },
      {
        $set: {
          status: "stopped",
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    return document ? withoutMongoId(document) : null;
  }

  async stopClaimed(document: EmailSpoolerDocument): Promise<boolean> {
    const result = await this.collection.updateOne(
      { uuid: document.uuid, status: "processing", leaseToken: document.leaseToken },
      {
        $set: {
          status: "stopped",
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      },
    );
    return result.modifiedCount === 1;
  }

  async stopCampaign(tenantId: string, campaignId: string): Promise<number> {
    const result = await this.collection.updateMany(
      { tenantId, campaignId, status: { $in: ["pending", "failed"] } },
      {
        $set: {
          status: "stopped",
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      },
    );
    return result.modifiedCount;
  }

  async deleteCampaignEntries(tenantId: string, campaignId: string): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, campaignId });
    return result.deletedCount;
  }

  async summary(campaignId: string): Promise<EmailCampaignSummary> {
    const rows = await this.collection
      .aggregate<{ _id: EmailSpoolerStatus; count: number }>([
        { $match: { campaignId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();
    const summary: EmailCampaignSummary = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      stopped: 0,
      total: 0,
    };
    for (const row of rows) {
      summary[row._id] = row.count;
      summary.total += row.count;
    }
    return summary;
  }

  async counts(tenantId: string): Promise<{ pending: number; processing: number; failed: number }> {
    const [pending, processing, failed] = await Promise.all([
      this.collection.countDocuments({ tenantId, status: "pending" }),
      this.collection.countDocuments({ tenantId, status: "processing" }),
      this.collection.countDocuments({ tenantId, status: "failed" }),
    ]);
    return { pending, processing, failed };
  }
}

export {
  EMAIL_CAMPAIGNS_COLLECTION,
  EMAIL_SPOOLER_COLLECTION,
  EMAIL_TEMPLATES_COLLECTION,
  USER_GROUP_MEMBERS_COLLECTION,
  USER_GROUPS_COLLECTION,
};

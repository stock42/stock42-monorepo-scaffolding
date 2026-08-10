import { Dependencies, type MongoClient } from "s42-core";
import { AuditService } from "@/audit/AuditService";
import { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";
import {
  EmailCampaignStorage,
  EmailSpoolerStorage,
  EmailTemplateStorage,
  UserGroupStorage,
} from "@/modules/email-marketing/services/EmailMarketingStorage";
import { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import { TelegramAiAccessStorage } from "@/modules/telegram-ai/services/TelegramAiAccessStorage";
import { UserStorage } from "@/modules/users/services/UserStorage";
import { WebSocketTicketService } from "@/websocket/WebSocketTicketService";

export async function ensureRequiredIndexes(): Promise<void> {
  const db = Dependencies.get<MongoClient>("db");
  if (!db) throw new Error("db dependency is not registered");

  await Promise.all([
    db
      .getCollection("migrations")
      .createIndexes([{ key: { id: 1 }, unique: true, name: "migrations_id_unique" }]),
    db.getCollection(AdministratorStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "administrators_uuid_unique" },
      { key: { email: 1 }, unique: true, name: "administrators_email_unique" },
    ]),
    db.getCollection(TenantStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "tenants_uuid_unique" },
      { key: { slug: 1 }, unique: true, name: "tenants_slug_unique" },
      { key: { status: 1, uuid: 1 }, name: "tenants_status_uuid" },
    ]),
    db.getCollection(OperatorStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "operators_uuid_unique" },
      {
        key: { tenantId: 1, email: 1 },
        unique: true,
        name: "operators_tenant_email_unique",
      },
      {
        key: { tenantId: 1, status: 1, uuid: 1 },
        name: "operators_tenant_status_uuid",
      },
    ]),
    db.getCollection(UserStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "users_uuid_unique" },
      {
        key: { tenantId: 1, email: 1 },
        unique: true,
        name: "users_tenant_email_unique",
      },
      { key: { tenantId: 1, status: 1, uuid: 1 }, name: "users_tenant_status_uuid" },
    ]),
    db.getCollection(TelegramAiAccessStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "telegram_ai_access_uuid_unique" },
      {
        key: { telegramUserId: 1 },
        unique: true,
        name: "telegram_ai_access_user_unique",
      },
      {
        key: { tenantId: 1, status: 1, uuid: 1 },
        name: "telegram_ai_access_tenant_status_uuid",
      },
    ]),
    db.getCollection(UserGroupStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "user_groups_uuid_unique" },
      {
        key: { tenantId: 1, name: 1 },
        unique: true,
        name: "user_groups_tenant_name_unique",
      },
      {
        key: { tenantId: 1, status: 1, uuid: 1 },
        name: "user_groups_tenant_status_uuid",
      },
    ]),
    db.getCollection(UserGroupStorage.membersCollectionName).createIndexes([
      {
        key: { tenantId: 1, groupId: 1, userId: 1 },
        unique: true,
        name: "user_group_members_unique",
      },
      {
        key: { tenantId: 1, groupId: 1, uuid: 1 },
        name: "user_group_members_group_uuid",
      },
    ]),
    db.getCollection(EmailTemplateStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "email_templates_uuid_unique" },
      {
        key: { tenantId: 1, name: 1 },
        unique: true,
        name: "email_templates_tenant_name_unique",
      },
      {
        key: { tenantId: 1, status: 1, uuid: 1 },
        name: "email_templates_tenant_status_uuid",
      },
    ]),
    db.getCollection(EmailCampaignStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "email_campaigns_uuid_unique" },
      {
        key: { tenantId: 1, idempotencyKey: 1 },
        unique: true,
        name: "email_campaigns_tenant_idempotency_unique",
      },
      {
        key: { tenantId: 1, status: 1, uuid: 1 },
        name: "email_campaigns_tenant_status_uuid",
      },
    ]),
    db.getCollection(EmailSpoolerStorage.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "email_spooler_uuid_unique" },
      {
        key: { campaignId: 1, userId: 1 },
        unique: true,
        name: "email_spooler_campaign_user_unique",
      },
      {
        key: { ready: 1, status: 1, scheduledAt: 1, uuid: 1 },
        name: "email_spooler_due",
      },
      {
        key: { tenantId: 1, campaignId: 1, status: 1 },
        name: "email_spooler_tenant_campaign_status",
      },
    ]),
    db.getCollection(AuditService.collectionName).createIndexes([
      { key: { uuid: 1 }, unique: true, name: "audit_uuid_unique" },
      { key: { tenantId: 1, createdAt: -1 }, name: "audit_tenant_created" },
      { key: { actorId: 1, createdAt: -1 }, name: "audit_actor_created" },
    ]),
    db.getCollection(WebSocketTicketService.collectionName).createIndexes([
      { key: { hash: 1 }, unique: true, name: "ws_ticket_hash_unique" },
      {
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
        name: "ws_ticket_expiry_ttl",
      },
    ]),
  ]);
}

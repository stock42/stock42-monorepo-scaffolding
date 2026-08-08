import { z } from "zod";
import { UserSchema } from "./tenancy";
import {
  EmailSchema,
  IsoDateSchema,
  PaginationMetaSchema,
  StatusSchema,
  UuidSchema,
  createSuccessSchema,
} from "./common";

export const USER_GROUPS_COLLECTION = "user_groups";
export const USER_GROUP_MEMBERS_COLLECTION = "user_group_members";
export const EMAIL_TEMPLATES_COLLECTION = "email_templates";
export const EMAIL_CAMPAIGNS_COLLECTION = "email_campaigns";
export const EMAIL_SPOOLER_COLLECTION = "email_spooler";

export const UserGroupSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  status: StatusSchema,
  memberCount: z.number().int().nonnegative(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const CreateUserGroupInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  userIds: z.array(UuidSchema).max(5_000).default([]),
});

export const UpdateUserGroupInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  status: StatusSchema,
  expectedVersion: z.number().int().positive(),
});

export const AddUserGroupMembersInputSchema = z.object({
  tenantId: UuidSchema,
  userIds: z.array(UuidSchema).min(1).max(5_000),
});

export const RemoveUserGroupMemberInputSchema = z.object({
  tenantId: UuidSchema,
});

export const UserGroupResponseSchema = createSuccessSchema(UserGroupSchema);
export const UserGroupListResponseSchema = createSuccessSchema(
  z.object({ items: z.array(UserGroupSchema), pagination: PaginationMetaSchema }),
);
export const UserGroupMembersResponseSchema = createSuccessSchema(
  z.object({ items: z.array(UserSchema), pagination: PaginationMetaSchema }),
);

export const EmailTemplateSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(500_000),
  status: StatusSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const CreateEmailTemplateInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(500_000),
});

export const UpdateEmailTemplateInputSchema = CreateEmailTemplateInputSchema.extend({
  status: StatusSchema,
  expectedVersion: z.number().int().positive(),
});

export const EmailTemplateResponseSchema = createSuccessSchema(EmailTemplateSchema);
export const EmailTemplateListResponseSchema = createSuccessSchema(
  z.object({ items: z.array(EmailTemplateSchema), pagination: PaginationMetaSchema }),
);

export const EmailCampaignStatusSchema = z.enum([
  "scheduled",
  "sending",
  "completed",
  "stopped",
  "failed",
]);
export const EmailSpoolerStatusSchema = z.enum([
  "pending",
  "processing",
  "sent",
  "failed",
  "stopped",
]);

export const EmailCampaignSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  stopped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const EmailCampaignSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  templateId: UuidSchema,
  groupId: UuidSchema,
  status: EmailCampaignStatusSchema,
  scheduledAt: IsoDateSchema,
  stoppedAt: IsoDateSchema.nullable(),
  summary: EmailCampaignSummarySchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const CreateEmailCampaignInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  templateId: UuidSchema,
  groupId: UuidSchema,
  scheduledAt: IsoDateSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
});

export const EmailCampaignActionInputSchema = z.object({ tenantId: UuidSchema });
export const EmailCampaignResponseSchema = createSuccessSchema(EmailCampaignSchema);
export const EmailCampaignListResponseSchema = createSuccessSchema(
  z.object({ items: z.array(EmailCampaignSchema), pagination: PaginationMetaSchema }),
);

export const EmailSpoolerEntrySchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  campaignId: UuidSchema,
  templateId: UuidSchema,
  userId: UuidSchema,
  to: EmailSchema,
  from: EmailSchema,
  subject: z.string().max(200),
  body: z.string().max(500_000),
  status: EmailSpoolerStatusSchema,
  scheduledAt: IsoDateSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().max(1_000).nullable(),
  sentAt: IsoDateSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const EmailSpoolerActionInputSchema = z.object({ tenantId: UuidSchema });
export const EmailSpoolerEntryResponseSchema = createSuccessSchema(EmailSpoolerEntrySchema);
export const EmailSpoolerListResponseSchema = createSuccessSchema(
  z.object({ items: z.array(EmailSpoolerEntrySchema), pagination: PaginationMetaSchema }),
);

export const EmailDeliveryHealthSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  from: EmailSchema.nullable(),
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export const EmailDeliveryHealthResponseSchema = createSuccessSchema(EmailDeliveryHealthSchema);

export type UserGroup = z.infer<typeof UserGroupSchema>;
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;
export type EmailCampaign = z.infer<typeof EmailCampaignSchema>;
export type EmailCampaignSummary = z.infer<typeof EmailCampaignSummarySchema>;
export type EmailCampaignStatus = z.infer<typeof EmailCampaignStatusSchema>;
export type EmailSpoolerEntry = z.infer<typeof EmailSpoolerEntrySchema>;
export type EmailSpoolerStatus = z.infer<typeof EmailSpoolerStatusSchema>;

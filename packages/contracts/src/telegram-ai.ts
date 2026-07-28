import { z } from "zod";
import { ActorRoleSchema } from "./auth";
import {
  IsoDateSchema,
  PaginationMetaSchema,
  StatusSchema,
  UuidSchema,
  createSuccessSchema,
} from "./common";

export const TELEGRAM_AI_ACCESS_COLLECTION = "agent_telegram_access";

export const TelegramUserIdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,20}$/);
export const TelegramAiActorRoleSchema = ActorRoleSchema.exclude(["tenant_user"]);

export const TelegramAiAccessSchema = z.object({
  uuid: UuidSchema,
  telegramUserId: TelegramUserIdSchema,
  label: z.string().min(1).max(120),
  tenantId: UuidSchema,
  actorId: UuidSchema,
  actorRole: TelegramAiActorRoleSchema,
  actorDisplayName: z.string().min(1).max(120),
  status: StatusSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const CreateTelegramAiAccessInputSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  label: z.string().trim().min(1).max(120),
  tenantId: UuidSchema,
});

export const UpdateTelegramAiAccessInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  status: StatusSchema,
  expectedVersion: z.number().int().positive(),
});

export const DeleteTelegramAiAccessInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const ScopedUpdateTelegramAiAccessInputSchema = UpdateTelegramAiAccessInputSchema.extend({
  tenantId: UuidSchema,
});

export const ScopedDeleteTelegramAiAccessInputSchema = DeleteTelegramAiAccessInputSchema.extend({
  tenantId: UuidSchema,
});

export const TelegramAiAccessResponseSchema = createSuccessSchema(TelegramAiAccessSchema);
export const TelegramAiAccessListResponseSchema = createSuccessSchema(
  z.object({
    items: z.array(TelegramAiAccessSchema),
    pagination: PaginationMetaSchema,
  }),
);

export type CreateTelegramAiAccessInput = z.infer<typeof CreateTelegramAiAccessInputSchema>;
export type TelegramAiAccess = z.infer<typeof TelegramAiAccessSchema>;
export type TelegramAiActorRole = z.infer<typeof TelegramAiActorRoleSchema>;
export type UpdateTelegramAiAccessInput = z.infer<typeof UpdateTelegramAiAccessInputSchema>;

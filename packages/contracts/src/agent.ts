import { z } from "zod";
import { ActorRoleSchema } from "./auth";
import { IsoDateSchema, UuidSchema, createSuccessSchema } from "./common";

export const AgentRunStatusSchema = z.enum([
  "queued",
  "starting",
  "running",
  "waiting",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "killed",
  "crashed",
]);

export const AgentActionLevelSchema = z.enum(["A0", "A1", "A2", "A3"]);
export const ToolActionClassSchema = z.enum(["read", "write", "critical"]);

export const CreateAgentRunInputSchema = z.object({
  conversationId: UuidSchema.optional(),
  task: z.string().trim().min(1).max(20_000),
  manifest: z.string().trim().min(1).max(120).default("assistant"),
  idempotencyKey: z.string().trim().min(8).max(200),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const BackofficeAgentRunInputSchema = CreateAgentRunInputSchema.extend({
  tenantId: UuidSchema,
});

export const BackofficeAgentScopeSchema = z.object({
  tenantId: UuidSchema,
});

export const AgentRunSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  actorId: UuidSchema,
  conversationId: UuidSchema,
  manifest: z.string().min(1),
  status: AgentRunStatusSchema,
  idempotencyKey: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().nullable(),
  attempt: z.number().int().nonnegative(),
  model: z.literal("deepseek-v4-pro"),
  reasoningEffort: z.enum(["high", "max"]),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  startedAt: IsoDateSchema.nullable(),
  finishedAt: IsoDateSchema.nullable(),
  terminalReason: z.string().nullable(),
});

export const AgentRunEventSchema = z.object({
  uuid: UuidSchema,
  runId: UuidSchema,
  tenantId: UuidSchema,
  sequence: z.number().int().positive(),
  type: z.enum([
    "run.status",
    "run.progress",
    "message",
    "tool.requested",
    "tool.completed",
    "confirmation.required",
    "confirmation.resolved",
    "artifact.created",
  ]),
  payload: z.record(z.string(), z.unknown()),
  createdAt: IsoDateSchema,
});

export const AgentConfirmationSchema = z.object({
  uuid: UuidSchema,
  runId: UuidSchema,
  tenantId: UuidSchema,
  actorId: UuidSchema,
  toolName: z.string().min(1),
  inputHash: z.string().min(32),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  expiresAt: IsoDateSchema,
  resolvedAt: IsoDateSchema.nullable(),
});

export const ResolveConfirmationInputSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export const AgentRunResponseSchema = createSuccessSchema(AgentRunSchema);
export const AgentRunEventsResponseSchema = createSuccessSchema(
  z.object({
    events: z.array(AgentRunEventSchema),
    nextCursor: z.number().int().nonnegative(),
  }),
);

export const InternalRunEnvelopeSchema = z.object({
  tenantId: UuidSchema,
  actorId: UuidSchema,
  actorRole: ActorRoleSchema,
  request: CreateAgentRunInputSchema,
});

export type AgentConfirmation = z.infer<typeof AgentConfirmationSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type BackofficeAgentRunInput = z.infer<typeof BackofficeAgentRunInputSchema>;
export type BackofficeAgentScope = z.infer<typeof BackofficeAgentScopeSchema>;
export type CreateAgentRunInput = z.infer<typeof CreateAgentRunInputSchema>;
export type InternalRunEnvelope = z.infer<typeof InternalRunEnvelopeSchema>;
export type ToolActionClass = z.infer<typeof ToolActionClassSchema>;

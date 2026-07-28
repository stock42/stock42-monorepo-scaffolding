import type {
  AgentRun,
  AgentRunEvent,
  AgentRunStatus,
  ToolActionClass,
} from "@stock42/contracts/agent";
import type { z } from "zod";

export type RunDocument = AgentRun & {
  actorRole: string;
  eventSequence: number;
  claimedBy: string | null;
  processId: string | null;
  pid: number | null;
  heartbeatAt: string | null;
  progressAt: string | null;
  deadlineAt: string;
  cancelRequestedAt: string | null;
  terminationRequestedAt: string | null;
  retryLimit: number;
};

export type RunEventDocument = AgentRunEvent;

export type MessageDocument = {
  uuid: string;
  conversationId: string;
  runId: string;
  tenantId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoningContent: string | null;
  toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  toolCallId: string | null;
  name: string | null;
  createdAt: string;
};

export type ConfirmationDocument = {
  uuid: string;
  runId: string;
  tenantId: string;
  actorId: string;
  toolName: string;
  input: unknown;
  inputHash: string;
  toolCallId: string;
  status: "pending" | "approved" | "rejected" | "expired";
  expiresAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  executedAt: string | null;
  createdAt: string;
};

export type ProcessDocument = {
  uuid: string;
  runId: string;
  launcherId: string;
  pid: number;
  status: "starting" | "running" | "exited";
  startedAt: string;
  exitedAt: string | null;
  exitCode: number | null;
};

export type AgentManifest<TInput extends z.ZodType = z.ZodType> = {
  id: string;
  version: string;
  kind: "tool" | "subagent";
  inputSchema: TInput;
  outputSchema: z.ZodType;
  actionLevel: "A0" | "A1" | "A2" | "A3";
  envAllowlist: string[];
  heartbeatMs: number;
  inactivityTimeoutMs: number;
  timeoutMs: number;
  cancelGraceMs: number;
  concurrency: { global: number; perTenant: number };
  retry: { limit: number };
  events: AgentRunEvent["type"][];
};

export type ToolContext = {
  run: RunDocument;
  actorRole: string;
};

export type ToolDefinition<TInput extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: z.ZodType;
  actionClass: ToolActionClass;
  allowedRoles: string[];
  timeoutMs: number;
  idempotent: boolean;
  execute: (input: z.infer<TInput>, context: ToolContext) => Promise<unknown>;
};

export const terminalStatuses = new Set<AgentRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "killed",
  "crashed",
]);

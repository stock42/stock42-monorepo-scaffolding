import { describe, expect, test } from "bun:test";
import {
  AgentRunSchema,
  BackofficeAgentRunInputSchema,
  type AgentRunEvent,
} from "@stock42/contracts/agent";
import { CreateTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { CreateEmailCampaignInputSchema } from "@stock42/contracts/email-marketing";
import { CreateTenantInputSchema } from "@stock42/contracts/tenancy";
import {
  agentRunStatusFromEvent,
  currentAgentProgress,
  updateAgentRunFromEvent,
} from "../lib/agent-run-events";

const now = new Date().toISOString();

const queuedRun = AgentRunSchema.parse({
  uuid: "30000000-0000-4000-8000-000000000001",
  tenantId: "20000000-0000-4000-8000-000000000001",
  actorId: "10000000-0000-4000-8000-000000000001",
  conversationId: "40000000-0000-4000-8000-000000000001",
  manifest: "assistant",
  status: "queued",
  idempotencyKey: "idempotency-key",
  input: { task: "Estado del tenant" },
  output: null,
  attempt: 0,
  model: "deepseek-v4-pro",
  reasoningEffort: "high",
  createdAt: now,
  updatedAt: now,
  startedAt: null,
  finishedAt: null,
  terminalReason: null,
});

function runEvent(
  sequence: number,
  type: AgentRunEvent["type"],
  payload: Record<string, unknown>,
): AgentRunEvent {
  return {
    uuid: crypto.randomUUID(),
    runId: queuedRun.uuid,
    tenantId: queuedRun.tenantId,
    sequence,
    type,
    payload,
    createdAt: now,
  };
}

describe("backoffice contracts", () => {
  test("rejects a tenant without owner credentials", () => {
    expect(
      CreateTenantInputSchema.safeParse({
        name: "Acme",
        slug: "acme",
      }).success,
    ).toBe(false);
  });

  test("requires a tenant on the HTTP agent surface", () => {
    expect(
      BackofficeAgentRunInputSchema.safeParse({
        task: "Estado del tenant",
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  test("replaces one progress line with the latest WebSocket event", () => {
    const events = [
      runEvent(1, "run.progress", {
        stage: "analyzing",
        message: "Analizando la solicitud...",
        step: 1,
      }),
      runEvent(2, "run.progress", {
        stage: "tool_started",
        message: "Ejecutando tenant_summary...",
        toolName: "tenant_summary",
      }),
    ];

    expect(currentAgentProgress({ ...queuedRun, status: "running" }, events)).toBe(
      "Ejecutando tenant_summary...",
    );
  });

  test("hydrates the terminal answer from the WebSocket status snapshot", () => {
    const succeeded = {
      ...queuedRun,
      status: "succeeded" as const,
      output: { answer: "Todo en orden." },
      finishedAt: now,
    };
    const event = runEvent(3, "run.status", { status: "succeeded", run: succeeded });

    expect(agentRunStatusFromEvent(event)).toBe("succeeded");
    expect(updateAgentRunFromEvent(queuedRun, event)).toEqual(succeeded);
    expect(currentAgentProgress(succeeded, [event])).toBeNull();
  });

  test("validates Telegram AI access creation", () => {
    expect(
      CreateTelegramAiAccessInputSchema.safeParse({
        tenantId: crypto.randomUUID(),
        telegramUserId: "987654321",
        label: "Owner",
      }).success,
    ).toBe(true);
  });

  test("validates tenant-scoped email campaigns", () => {
    expect(
      CreateEmailCampaignInputSchema.safeParse({
        tenantId: crypto.randomUUID(),
        name: "Campaña de agosto",
        templateId: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        scheduledAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });
});

import {
  AgentRunProgressSchema,
  AgentRunSchema,
  AgentRunStatusSchema,
  type AgentRun,
  type AgentRunEvent,
  type AgentRunStatus,
} from "@stock42/contracts/agent";

const terminalStatuses = new Set<AgentRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "killed",
  "crashed",
]);

const statusProgress: Partial<Record<AgentRunStatus, string>> = {
  queued: "Consulta en cola...",
  starting: "Preparando la ejecución...",
  running: "Analizando la solicitud...",
  cancel_requested: "Cancelando la ejecución...",
};

export function agentRunStatusFromEvent(event: AgentRunEvent): AgentRunStatus | null {
  if (event.type !== "run.status") return null;
  const snapshot = AgentRunSchema.safeParse(event.payload.run);
  if (snapshot.success) return snapshot.data.status;
  const status = AgentRunStatusSchema.safeParse(event.payload.status);
  return status.success ? status.data : null;
}

export function updateAgentRunFromEvent(
  current: AgentRun | null,
  event: AgentRunEvent,
): AgentRun | null {
  if (event.type !== "run.status") return current;
  const snapshot = AgentRunSchema.safeParse(event.payload.run);
  if (snapshot.success) return snapshot.data;
  const status = AgentRunStatusSchema.safeParse(event.payload.status);
  if (!current || !status.success) return current;
  return {
    ...current,
    status: status.data,
    updatedAt: event.createdAt,
    ...(terminalStatuses.has(status.data) ? { finishedAt: event.createdAt } : {}),
    ...(typeof event.payload.reason === "string" ? { terminalReason: event.payload.reason } : {}),
  };
}

export function currentAgentProgress(run: AgentRun | null, events: AgentRunEvent[]): string | null {
  if (!run || terminalStatuses.has(run.status)) return null;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === "run.progress") {
      const progress = AgentRunProgressSchema.safeParse(event.payload);
      if (progress.success) return progress.data.message;
    }
    if (event.type === "confirmation.required") {
      const toolName =
        typeof event.payload.toolName === "string" ? ` para ${event.payload.toolName}` : "";
      return `Esperando confirmación${toolName}...`;
    }
    if (event.type === "run.status") {
      const status = agentRunStatusFromEvent(event);
      if (status && status !== "waiting") return statusProgress[status] ?? null;
    }
  }

  return (
    statusProgress[run.status] ?? (run.status === "waiting" ? "Esperando confirmación..." : null)
  );
}

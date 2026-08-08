import {
  AgentRunSchema,
  type AgentRun,
  type AgentRunEvent,
  type AgentRunStatus,
  type InternalRunEnvelope,
} from "@stock42/contracts/agent";
import type { ActorRole } from "@stock42/contracts/auth";
import {
  TELEGRAM_AI_ACCESS_COLLECTION,
  TelegramAiAccessSchema,
  type TelegramAiAccess,
} from "@stock42/contracts/telegram-ai";
import { MongoClient, MongoServerError, type Collection, type Db, type WithId } from "mongodb";
import type { AgentConfig } from "@/config";
import type {
  ConfirmationDocument,
  MessageDocument,
  ProcessDocument,
  RunDocument,
  RunEventDocument,
  ToolExecutionDocument,
} from "../contracts/types";
import { canAccessOwnedResource, ownerFilter, type ResourceActor } from "../authorization";
import { terminalStatuses } from "../contracts/types";

type ConversationDocument = {
  uuid: string;
  tenantId: string;
  actorId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type UploadDocument = {
  uuid: string;
  tenantId: string;
  ownerId: string;
  fileName: string;
  storageName: string;
  mimeType: string;
  declaredSize: number;
  size: number;
  expectedSha256: string;
  sha256: string | null;
  status: "pending" | "ready" | "rejected" | "deleted";
  createdAt: string;
  updatedAt: string;
};

export type ArtifactDocument = {
  uuid: string;
  tenantId: string;
  ownerId: string;
  runId: string | null;
  fileName: string;
  storageName: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
};

export type DeliveryDocument = {
  uuid: string;
  tenantId: string;
  runId: string;
  provider: "telegram";
  idempotencyKey: string;
  status: "pending" | "sent" | "failed";
  externalId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramRuntimeDocument = {
  uuid: "telegram-polling";
  enabled: boolean;
  state: "disabled" | "starting" | "polling" | "degraded" | "stopped";
  running: boolean;
  offset: number;
  restartCount: number;
  heartbeatAt: string | null;
  lastUpdateAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  nextRetryAt: string | null;
  updatedAt: string;
};

type TelegramSessionDocument = {
  uuid: string;
  transport: "telegram";
  tenantId: string;
  actorId: string;
  externalChatId: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
};

const activeStatuses: AgentRunStatus[] = ["starting", "running", "cancel_requested"];

const transitions: Record<AgentRunStatus, AgentRunStatus[]> = {
  queued: ["starting", "cancelled"],
  starting: [
    "running",
    "cancel_requested",
    "failed",
    "cancelled",
    "timed_out",
    "killed",
    "crashed",
  ],
  running: [
    "waiting",
    "cancel_requested",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
    "killed",
    "crashed",
  ],
  waiting: ["queued", "cancelled", "failed"],
  cancel_requested: ["cancelled", "killed", "crashed"],
  succeeded: [],
  failed: ["queued"],
  cancelled: [],
  timed_out: [],
  killed: [],
  crashed: ["queued"],
};

function withoutMongoId<T>(document: WithId<T> | T): T {
  const value = { ...document } as Record<string, unknown>;
  delete value._id;
  return value as unknown as T;
}

export class AgentResourceNotFoundError extends Error {
  constructor() {
    super("Agent resource not found");
    this.name = "AgentResourceNotFoundError";
  }
}

export class AgentAttemptInactiveError extends Error {
  constructor() {
    super("Agent attempt is no longer active");
    this.name = "AgentAttemptInactiveError";
  }
}

export class AgentStore {
  private readonly client: MongoClient;
  private db: Db | null = null;

  constructor(private readonly config: AgentConfig) {
    this.client = new MongoClient(config.mongo.uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.config.mongo.database);
    await this.db.command({ ping: 1 });
  }

  async close(): Promise<void> {
    await this.client.close();
    this.db = null;
  }

  async ensureIndexes(): Promise<void> {
    await this.migrateLegacyRunIdempotencyIndex();
    await Promise.all([
      this.runs.createIndex(
        { tenantId: 1, actorId: 1, idempotencyKey: 1 },
        { unique: true, name: "runs_tenant_actor_idempotency_unique" },
      ),
      this.runs.createIndex({ uuid: 1 }, { unique: true, name: "runs_uuid_unique" }),
      this.runs.createIndex({ status: 1, createdAt: 1 }, { name: "runs_claim_queue" }),
      this.runs.createIndex({ tenantId: 1, status: 1 }, { name: "runs_tenant_status" }),
      this.runs.createIndex(
        { status: 1, heartbeatAt: 1, deadlineAt: 1 },
        { name: "runs_supervision" },
      ),
      this.runs.createIndex({ status: 1, updatedAt: 1 }, { name: "runs_supervision_queue" }),
      this.runs.createIndex(
        { telegramDeliveryStatus: 1, status: 1, updatedAt: -1 },
        { name: "runs_telegram_delivery" },
      ),
      this.events.createIndex(
        { runId: 1, sequence: 1 },
        { unique: true, name: "events_run_sequence_unique" },
      ),
      this.events.createIndex(
        { tenantId: 1, runId: 1, sequence: 1 },
        { name: "events_tenant_run_sequence" },
      ),
      this.messages.createIndex(
        { conversationId: 1, createdAt: 1 },
        { name: "messages_conversation_created" },
      ),
      this.conversations.createIndex(
        { tenantId: 1, uuid: 1 },
        { unique: true, name: "conversations_tenant_uuid_unique" },
      ),
      this.confirmations.createIndex(
        { uuid: 1 },
        { unique: true, name: "confirmations_uuid_unique" },
      ),
      this.confirmations.createIndex({ runId: 1, status: 1 }, { name: "confirmations_run_status" }),
      this.confirmations.createIndex({ expiresAt: 1 }, { name: "confirmations_expiry" }),
      this.toolExecutions.createIndex(
        { runId: 1, toolCallId: 1, inputHash: 1 },
        { unique: true, name: "tool_executions_run_call_input_unique" },
      ),
      this.toolExecutions.createIndex(
        { uuid: 1 },
        { unique: true, name: "tool_executions_uuid_unique" },
      ),
      this.processes.createIndex({ runId: 1, startedAt: -1 }, { name: "processes_run_started" }),
      this.processes.createIndex({ uuid: 1 }, { unique: true, name: "processes_uuid_unique" }),
      this.uploads.createIndex({ uuid: 1 }, { unique: true, name: "uploads_uuid_unique" }),
      this.uploads.createIndex(
        { tenantId: 1, ownerId: 1, createdAt: -1 },
        { name: "uploads_tenant_owner_created" },
      ),
      this.artifacts.createIndex({ uuid: 1 }, { unique: true, name: "artifacts_uuid_unique" }),
      this.artifacts.createIndex(
        { tenantId: 1, runId: 1, createdAt: -1 },
        { name: "artifacts_tenant_run_created" },
      ),
      this.deliveries.createIndex(
        { tenantId: 1, idempotencyKey: 1 },
        { unique: true, name: "deliveries_tenant_idempotency_unique" },
      ),
      this.deliveries.createIndex({ uuid: 1 }, { unique: true, name: "deliveries_uuid_unique" }),
      this.telegramSessions.createIndex(
        { transport: 1, tenantId: 1, externalChatId: 1 },
        { unique: true, name: "telegram_sessions_tenant_chat_unique" },
      ),
      this.telegramRuntime.createIndex(
        { uuid: 1 },
        { unique: true, name: "telegram_runtime_uuid_unique" },
      ),
    ]);
  }

  async enqueue(envelope: InternalRunEnvelope): Promise<AgentRun> {
    const existing = await this.runs.findOne({
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      idempotencyKey: envelope.request.idempotencyKey,
    });
    if (existing) return this.toPublicRun(existing);

    const now = new Date();
    const conversationId = envelope.request.conversationId ?? crypto.randomUUID();
    let conversationOwnerId = envelope.actorId;
    if (envelope.request.conversationId) {
      const conversation = await this.conversations.findOne({
        uuid: conversationId,
        tenantId: envelope.tenantId,
      });
      if (
        conversation &&
        !canAccessOwnedResource(conversation.actorId, {
          actorId: envelope.actorId,
          actorRole: envelope.actorRole,
        })
      ) {
        throw new AgentResourceNotFoundError();
      }
      if (conversation) conversationOwnerId = conversation.actorId;
    }
    const run: RunDocument = {
      uuid: crypto.randomUUID(),
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      actorRole: envelope.actorRole,
      conversationId,
      manifest: envelope.request.manifest,
      status: "queued",
      idempotencyKey: envelope.request.idempotencyKey,
      input: envelope.request,
      output: null,
      attempt: 0,
      model: "deepseek-v4-pro",
      reasoningEffort: this.config.deepseek.reasoningEffort,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      startedAt: null,
      finishedAt: null,
      terminalReason: null,
      eventSequence: 0,
      claimedBy: null,
      processId: null,
      pid: null,
      heartbeatAt: null,
      progressAt: null,
      deadlineAt: new Date(now.getTime() + this.config.runtime.runTimeoutMs).toISOString(),
      cancelRequestedAt: null,
      terminationRequestedAt: null,
      retryLimit: 1,
      telegramDeliveryStatus: envelope.request.metadata.channel === "telegram" ? "pending" : null,
      telegramConfirmationNotifiedId: null,
    };

    try {
      await this.runs.insertOne(run);
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        const raced = await this.runs.findOne({
          tenantId: envelope.tenantId,
          actorId: envelope.actorId,
          idempotencyKey: envelope.request.idempotencyKey,
        });
        if (raced) return this.toPublicRun(raced);
      }
      throw cause;
    }

    try {
      await this.conversations.updateOne(
        { uuid: conversationId, tenantId: envelope.tenantId, actorId: conversationOwnerId },
        {
          $setOnInsert: {
            uuid: conversationId,
            tenantId: envelope.tenantId,
            actorId: conversationOwnerId,
            title: envelope.request.task.slice(0, 120),
            createdAt: now.toISOString(),
          },
          $set: { updatedAt: now.toISOString() },
        },
        { upsert: true },
      );
    } catch (cause) {
      await this.runs.deleteOne({ uuid: run.uuid, status: "queued", eventSequence: 0 });
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new AgentResourceNotFoundError();
      }
      throw cause;
    }
    await this.addMessage({
      uuid: crypto.randomUUID(),
      conversationId,
      runId: run.uuid,
      tenantId: run.tenantId,
      role: "user",
      content: envelope.request.task,
      reasoningContent: null,
      toolCalls: [],
      toolCallId: null,
      name: null,
      createdAt: now.toISOString(),
    });
    await this.appendEvent(run.uuid, "run.status", { status: "queued" });
    return this.toPublicRun(run);
  }

  async getRun(runId: string, tenantId?: string): Promise<RunDocument | null> {
    return this.runs.findOne({
      uuid: runId,
      ...(tenantId ? { tenantId } : {}),
    });
  }

  async getRunForActor(
    runId: string,
    tenantId: string,
    actor: ResourceActor,
  ): Promise<RunDocument | null> {
    return this.runs.findOne({
      uuid: runId,
      tenantId,
      ...ownerFilter("actorId", actor),
    });
  }

  async listEvents(runId: string, tenantId: string, actor: ResourceActor, cursor: number) {
    const run = await this.getRunForActor(runId, tenantId, actor);
    if (!run) return null;
    const events = await this.events
      .find({ runId, tenantId, sequence: { $gt: cursor } })
      .sort({ sequence: 1 })
      .limit(200)
      .toArray();
    return {
      events: events.map(withoutMongoId),
      nextCursor: events.at(-1)?.sequence ?? cursor,
    };
  }

  async appendEvent(
    runId: string,
    type: AgentRunEvent["type"],
    payload: Record<string, unknown>,
  ): Promise<RunEventDocument> {
    const run = await this.runs.findOneAndUpdate(
      { uuid: runId },
      { $inc: { eventSequence: 1 }, $set: { updatedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    );
    if (!run) throw new Error(`Run no encontrado: ${runId}`);
    const event: RunEventDocument = {
      uuid: crypto.randomUUID(),
      runId,
      tenantId: run.tenantId,
      sequence: run.eventSequence,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    await this.events.insertOne(event);
    return event;
  }

  async countActive(tenantId?: string): Promise<number> {
    return this.runs.countDocuments({
      status: { $in: activeStatuses },
      ...(tenantId ? { tenantId } : {}),
    });
  }

  async claimNext(launcherId: string, processId: string): Promise<RunDocument | null> {
    if ((await this.countActive()) >= this.config.runtime.globalConcurrency) return null;
    const candidates = await this.runs
      .find({ status: "queued" })
      .sort({ createdAt: 1 })
      .limit(20)
      .toArray();

    for (const candidate of candidates) {
      if ((await this.countActive(candidate.tenantId)) >= this.config.runtime.tenantConcurrency) {
        continue;
      }
      const now = new Date().toISOString();
      const claimed = await this.runs.findOneAndUpdate(
        { uuid: candidate.uuid, status: "queued" },
        {
          $set: {
            status: "starting",
            claimedBy: launcherId,
            processId,
            startedAt: candidate.startedAt ?? now,
            heartbeatAt: now,
            progressAt: now,
            updatedAt: now,
            terminalReason: null,
          },
          $inc: { attempt: 1 },
        },
        { returnDocument: "after" },
      );
      if (claimed) {
        await this.appendEvent(claimed.uuid, "run.status", { status: "starting" });
        return claimed;
      }
    }
    return null;
  }

  async attachProcess(runId: string, process: ProcessDocument): Promise<void> {
    await Promise.all([
      this.processes.insertOne(process),
      this.runs.updateOne(
        { uuid: runId, processId: process.uuid },
        { $set: { pid: process.pid, updatedAt: new Date().toISOString() } },
      ),
    ]);
  }

  async markProcessExited(processId: string, exitCode: number): Promise<void> {
    await this.processes.updateOne(
      { uuid: processId },
      {
        $set: {
          status: "exited",
          exitCode,
          exitedAt: new Date().toISOString(),
        },
      },
    );
  }

  async markRunning(runId: string, processId: string, pid: number): Promise<void> {
    const now = new Date().toISOString();
    const updated = await this.runs.findOneAndUpdate(
      { uuid: runId, processId, status: "starting" },
      {
        $set: {
          status: "running",
          pid,
          heartbeatAt: now,
          progressAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!updated) throw new Error("El run ya no puede comenzar.");
    await this.processes.updateOne({ uuid: processId }, { $set: { status: "running" } });
    await this.appendEvent(runId, "run.status", { status: "running" });
  }

  async heartbeat(runId: string, processId: string, progress = false): Promise<void> {
    const now = new Date().toISOString();
    const result = await this.runs.updateOne(
      {
        uuid: runId,
        processId,
        status: { $in: ["starting", "running", "cancel_requested"] },
      },
      {
        $set: {
          heartbeatAt: now,
          ...(progress ? { progressAt: now } : {}),
          updatedAt: now,
        },
      },
    );
    if (!result.matchedCount) throw new AgentAttemptInactiveError();
  }

  async assertActiveAttempt(runId: string, processId: string): Promise<void> {
    const active = await this.runs.findOne(
      { uuid: runId, processId, status: "running", terminationRequestedAt: null },
      { projection: { _id: 1 } },
    );
    if (!active) throw new AgentAttemptInactiveError();
  }

  async transition(
    runId: string,
    status: AgentRunStatus,
    updates: Partial<RunDocument> = {},
    expectedProcessId?: string,
  ): Promise<RunDocument> {
    const current = await this.runs.findOne({
      uuid: runId,
      ...(expectedProcessId ? { processId: expectedProcessId } : {}),
    });
    if (!current && expectedProcessId) throw new AgentAttemptInactiveError();
    if (!current) throw new Error(`Run no encontrado: ${runId}`);
    if (current.status === status) return current;
    if (!transitions[current.status].includes(status)) {
      throw new Error(`Transición inválida: ${current.status} -> ${status}`);
    }
    const now = new Date().toISOString();
    const terminal = terminalStatuses.has(status);
    const updated = await this.runs.findOneAndUpdate(
      {
        uuid: runId,
        status: current.status,
        ...(expectedProcessId ? { processId: expectedProcessId } : {}),
      },
      {
        $set: {
          ...updates,
          status,
          updatedAt: now,
          ...(terminal ? { finishedAt: now } : {}),
        },
      },
      { returnDocument: "after" },
    );
    if (!updated) {
      if (expectedProcessId) throw new AgentAttemptInactiveError();
      return this.transition(runId, status, updates);
    }
    await this.appendEvent(runId, "run.status", {
      status,
      ...(updated.terminalReason ? { reason: updated.terminalReason } : {}),
    });
    return updated;
  }

  async requestCancellation(
    runId: string,
    tenantId: string,
    actor: ResourceActor,
  ): Promise<RunDocument | null> {
    const run = await this.getRunForActor(runId, tenantId, actor);
    if (!run) return null;
    if (terminalStatuses.has(run.status)) return run;
    if (run.status === "queued" || run.status === "waiting") {
      return this.transition(runId, "cancelled", {
        cancelRequestedAt: new Date().toISOString(),
        terminalReason: "cancelled_by_actor",
      });
    }
    if (run.status === "cancel_requested") return run;
    return this.transition(runId, "cancel_requested", {
      cancelRequestedAt: new Date().toISOString(),
    });
  }

  async supervisionCandidates(): Promise<RunDocument[]> {
    return this.runs
      .find({ status: { $in: activeStatuses } })
      .sort({ updatedAt: 1 })
      .limit(500)
      .toArray();
  }

  async noteTerminationRequested(runId: string, processId: string, reason: string): Promise<void> {
    const result = await this.runs.updateOne(
      {
        uuid: runId,
        processId,
        status: { $in: activeStatuses },
        terminationRequestedAt: null,
      },
      {
        $set: {
          terminationRequestedAt: new Date().toISOString(),
          terminalReason: reason,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    if (!result.matchedCount) throw new AgentAttemptInactiveError();
  }

  async noteForcedTermination(runId: string, processId: string, reason: string): Promise<void> {
    const result = await this.runs.updateOne(
      { uuid: runId, processId, status: { $in: activeStatuses } },
      { $set: { terminalReason: reason, updatedAt: new Date().toISOString() } },
    );
    if (!result.matchedCount) throw new AgentAttemptInactiveError();
  }

  async processOwnsRun(run: RunDocument): Promise<boolean> {
    if (!run.processId || !run.pid) return false;
    const processDocument = await this.processes.findOne({
      uuid: run.processId,
      runId: run.uuid,
      pid: run.pid,
      status: { $in: ["starting", "running"] },
    });
    if (!processDocument) return false;
    return Boolean(
      await this.runs.findOne(
        { uuid: run.uuid, processId: run.processId, pid: run.pid },
        { projection: { _id: 1 } },
      ),
    );
  }

  async expireConfirmations(): Promise<number> {
    const now = new Date().toISOString();
    const expired = await this.confirmations
      .find({ status: "pending", expiresAt: { $lte: now } })
      .limit(100)
      .toArray();
    for (const confirmation of expired) {
      const result = await this.confirmations.updateOne(
        { uuid: confirmation.uuid, status: "pending" },
        {
          $set: {
            status: "expired",
            resolvedAt: now,
            resolvedBy: "system",
          },
        },
      );
      if (!result.modifiedCount) continue;
      await this.appendEvent(confirmation.runId, "confirmation.resolved", {
        confirmationId: confirmation.uuid,
        decision: "expired",
        resolvedBy: "system",
      });
      const run = await this.runs.findOne({ uuid: confirmation.runId, status: "waiting" });
      if (run) {
        await this.transition(run.uuid, "queued", {
          processId: null,
          pid: null,
          claimedBy: null,
          heartbeatAt: null,
          terminationRequestedAt: null,
        });
      }
    }
    return expired.length;
  }

  async addMessage(message: MessageDocument): Promise<void> {
    await this.messages.insertOne(message);
  }

  async messagesForConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<MessageDocument[]> {
    const messages = await this.messages
      .find({ conversationId, tenantId })
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray();
    return messages.map(withoutMongoId);
  }

  async createConfirmation(
    input: Omit<
      ConfirmationDocument,
      "uuid" | "status" | "resolvedAt" | "resolvedBy" | "executedAt" | "createdAt"
    >,
  ): Promise<ConfirmationDocument> {
    const confirmation: ConfirmationDocument = {
      ...input,
      uuid: crypto.randomUUID(),
      status: "pending",
      resolvedAt: null,
      resolvedBy: null,
      executedAt: null,
      createdAt: new Date().toISOString(),
    };
    await this.confirmations.insertOne(confirmation);
    await this.appendEvent(input.runId, "confirmation.required", {
      confirmationId: confirmation.uuid,
      toolName: confirmation.toolName,
      expiresAt: confirmation.expiresAt,
      ...(confirmation.preview ? { preview: confirmation.preview } : {}),
    });
    return confirmation;
  }

  async beginToolExecution(input: {
    run: RunDocument;
    processId: string;
    toolCallId: string;
    toolName: string;
    inputHash: string;
    idempotent: boolean;
  }): Promise<
    { kind: "execute"; execution: ToolExecutionDocument } | { kind: "cached"; output: unknown }
  > {
    await this.assertActiveAttempt(input.run.uuid, input.processId);
    const key = {
      runId: input.run.uuid,
      toolCallId: input.toolCallId,
      inputHash: input.inputHash,
    };
    let existing = await this.toolExecutions.findOne(key);
    if (!existing) {
      const now = new Date().toISOString();
      const execution: ToolExecutionDocument = {
        uuid: crypto.randomUUID(),
        ...key,
        tenantId: input.run.tenantId,
        toolName: input.toolName,
        processId: input.processId,
        status: "running",
        output: null,
        error: null,
        attempts: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      try {
        await this.toolExecutions.insertOne(execution);
        return { kind: "execute", execution };
      } catch (cause) {
        if (!(cause instanceof MongoServerError && cause.code === 11_000)) throw cause;
        existing = await this.toolExecutions.findOne(key);
      }
    }
    if (!existing) throw new Error("No fue posible reclamar la ejecución de la tool.");
    if (existing.status === "succeeded") return { kind: "cached", output: existing.output };
    if (!input.idempotent) {
      throw new Error("La tool no idempotente requiere reconciliación manual antes de reintentar.");
    }
    const now = new Date().toISOString();
    const reclaimed = await this.toolExecutions.findOneAndUpdate(
      { ...key, status: existing.status, processId: existing.processId },
      {
        $set: {
          processId: input.processId,
          status: "running",
          output: null,
          error: null,
          updatedAt: now,
          completedAt: null,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after" },
    );
    if (!reclaimed) throw new AgentAttemptInactiveError();
    return { kind: "execute", execution: reclaimed };
  }

  async completeToolExecution(uuid: string, processId: string, output: unknown): Promise<void> {
    const now = new Date().toISOString();
    const result = await this.toolExecutions.updateOne(
      { uuid, processId, status: "running" },
      { $set: { status: "succeeded", output, error: null, updatedAt: now, completedAt: now } },
    );
    if (!result.matchedCount) throw new AgentAttemptInactiveError();
  }

  async failToolExecution(uuid: string, processId: string, cause: unknown): Promise<void> {
    const now = new Date().toISOString();
    await this.toolExecutions.updateOne(
      { uuid, processId, status: "running" },
      {
        $set: {
          status: "failed",
          error: cause instanceof Error ? cause.message.slice(0, 240) : "tool_failed",
          updatedAt: now,
          completedAt: now,
        },
      },
    );
  }

  async resolveConfirmation(
    uuid: string,
    tenantId: string,
    actorId: string,
    actorRole: ActorRole,
    decision: "approved" | "rejected",
  ): Promise<RunDocument | null> {
    const now = new Date().toISOString();
    const confirmation = await this.confirmations.findOneAndUpdate(
      {
        uuid,
        tenantId,
        status: "pending",
        expiresAt: { $gt: now },
        ...ownerFilter("actorId", { actorId, actorRole }),
      },
      {
        $set: {
          status: decision,
          resolvedAt: now,
          resolvedBy: actorId,
        },
      },
      { returnDocument: "after" },
    );
    if (!confirmation) return null;
    await this.appendEvent(confirmation.runId, "confirmation.resolved", {
      confirmationId: uuid,
      decision,
      resolvedBy: actorId,
    });
    const run = await this.runs.findOne({ uuid: confirmation.runId, tenantId });
    if (run?.status === "waiting") {
      return this.transition(run.uuid, "queued", {
        processId: null,
        pid: null,
        claimedBy: null,
        heartbeatAt: null,
        terminationRequestedAt: null,
      });
    }
    return run;
  }

  async nextResolvedConfirmation(runId: string): Promise<ConfirmationDocument | null> {
    return this.confirmations.findOne({
      runId,
      status: { $in: ["approved", "rejected", "expired"] },
      executedAt: null,
    });
  }

  async markConfirmationExecuted(uuid: string): Promise<void> {
    await this.confirmations.updateOne(
      { uuid, executedAt: null },
      { $set: { executedAt: new Date().toISOString() } },
    );
  }

  async findActiveTelegramAccess(telegramUserId: string): Promise<TelegramAiAccess | null> {
    const document = await this.telegramAccess.findOne({
      telegramUserId,
      status: "active",
    });
    return document ? this.validateActiveTelegramAccess(document) : null;
  }

  async findActiveTelegramDestination(
    uuid: string,
    tenantId: string,
  ): Promise<TelegramAiAccess | null> {
    const document = await this.telegramAccess.findOne({ uuid, tenantId, status: "active" });
    return document ? this.validateActiveTelegramAccess(document) : null;
  }

  private async validateActiveTelegramAccess(
    document: TelegramAiAccess,
  ): Promise<TelegramAiAccess | null> {
    const access = TelegramAiAccessSchema.parse(withoutMongoId(document));
    const tenant = await this.database.collection("tenants").findOne({
      uuid: access.tenantId,
      status: "active",
    });
    if (!tenant) return null;

    if (access.actorRole === "platform_admin") {
      const administrator = await this.database.collection("administrators").findOne({
        uuid: access.actorId,
        status: "active",
      });
      return administrator ? access : null;
    }

    const operator = await this.database.collection("operators").findOne({
      uuid: access.actorId,
      tenantId: access.tenantId,
      status: "active",
      role: access.actorRole === "tenant_owner" ? "owner" : "operator",
    });
    return operator ? access : null;
  }

  async telegramConversation(access: TelegramAiAccess, externalChatId: string): Promise<string> {
    const now = new Date().toISOString();
    const conversationId = crypto.randomUUID();
    const session = await this.telegramSessions.findOneAndUpdate(
      {
        transport: "telegram",
        tenantId: access.tenantId,
        externalChatId,
      },
      {
        $setOnInsert: {
          uuid: crypto.randomUUID(),
          transport: "telegram",
          tenantId: access.tenantId,
          externalChatId,
          conversationId,
          createdAt: now,
        },
        $set: {
          actorId: access.actorId,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!session) throw new Error("No fue posible crear la sesión Telegram.");
    return session.conversationId;
  }

  async telegramOffset(): Promise<number> {
    return (await this.telegramRuntime.findOne({ uuid: "telegram-polling" }))?.offset ?? 0;
  }

  async advanceTelegramOffset(offset: number): Promise<void> {
    await this.ensureTelegramRuntimeDocument();
    const now = new Date().toISOString();
    await this.telegramRuntime.updateOne(
      { uuid: "telegram-polling" },
      {
        $max: { offset },
        $set: { updatedAt: now, lastUpdateAt: now },
      },
    );
  }

  async setTelegramRuntimeStatus(
    updates: Partial<Omit<TelegramRuntimeDocument, "uuid" | "offset" | "updatedAt">>,
  ): Promise<void> {
    await this.ensureTelegramRuntimeDocument();
    const now = new Date().toISOString();
    await this.telegramRuntime.updateOne(
      { uuid: "telegram-polling" },
      { $set: { ...updates, updatedAt: now } },
    );
  }

  async telegramRuntimeStatus(): Promise<TelegramRuntimeDocument | null> {
    const document = await this.telegramRuntime.findOne({ uuid: "telegram-polling" });
    return document ? withoutMongoId(document) : null;
  }

  async telegramRunsForDelivery(): Promise<RunDocument[]> {
    return this.runs
      .find({
        "input.metadata.channel": "telegram",
        telegramDeliveryStatus: "pending",
        status: {
          $in: ["waiting", "succeeded", "failed", "cancelled", "timed_out", "killed", "crashed"],
        },
      })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
  }

  async pendingConfirmation(runId: string): Promise<ConfirmationDocument | null> {
    return this.confirmations.findOne({ runId, status: "pending" });
  }

  async markTelegramConfirmationNotified(runId: string, confirmationId: string): Promise<void> {
    await this.runs.updateOne(
      { uuid: runId, telegramDeliveryStatus: "pending" },
      {
        $set: {
          telegramConfirmationNotifiedId: confirmationId,
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  async completeTelegramDelivery(runId: string, status: "sent" | "revoked"): Promise<void> {
    await this.runs.updateOne(
      { uuid: runId, telegramDeliveryStatus: "pending" },
      {
        $set: {
          telegramDeliveryStatus: status,
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  toPublicRun(run: RunDocument): AgentRun {
    return AgentRunSchema.parse(run);
  }

  get uploadsCollection(): Collection<UploadDocument> {
    return this.uploads;
  }

  get artifactsCollection(): Collection<ArtifactDocument> {
    return this.artifacts;
  }

  get deliveriesCollection(): Collection<DeliveryDocument> {
    return this.deliveries;
  }

  private get database(): Db {
    if (!this.db) throw new Error("AgentStore no conectado.");
    return this.db;
  }

  private get conversations(): Collection<ConversationDocument> {
    return this.database.collection("agent_conversations");
  }

  private get messages(): Collection<MessageDocument> {
    return this.database.collection("agent_messages");
  }

  private get runs(): Collection<RunDocument> {
    return this.database.collection("agent_runs");
  }

  private get events(): Collection<RunEventDocument> {
    return this.database.collection("agent_events");
  }

  private get confirmations(): Collection<ConfirmationDocument> {
    return this.database.collection("agent_confirmations");
  }

  private get processes(): Collection<ProcessDocument> {
    return this.database.collection("agent_processes");
  }

  private get toolExecutions(): Collection<ToolExecutionDocument> {
    return this.database.collection("agent_tool_executions");
  }

  private get uploads(): Collection<UploadDocument> {
    return this.database.collection("agent_uploads");
  }

  private get artifacts(): Collection<ArtifactDocument> {
    return this.database.collection("agent_artifacts");
  }

  private get deliveries(): Collection<DeliveryDocument> {
    return this.database.collection("agent_deliveries");
  }

  private get telegramAccess(): Collection<TelegramAiAccess> {
    return this.database.collection(TELEGRAM_AI_ACCESS_COLLECTION);
  }

  private get telegramSessions(): Collection<TelegramSessionDocument> {
    return this.database.collection("agent_telegram_sessions");
  }

  private get telegramRuntime(): Collection<TelegramRuntimeDocument> {
    return this.database.collection("agent_telegram_runtime");
  }

  private async ensureTelegramRuntimeDocument(): Promise<void> {
    const now = new Date().toISOString();
    await this.telegramRuntime.updateOne(
      { uuid: "telegram-polling" },
      {
        $setOnInsert: {
          uuid: "telegram-polling",
          enabled: false,
          state: "disabled",
          running: false,
          offset: 0,
          restartCount: 0,
          heartbeatAt: null,
          lastUpdateAt: null,
          lastErrorAt: null,
          lastError: null,
          nextRetryAt: null,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }

  private async migrateLegacyRunIdempotencyIndex(): Promise<void> {
    let indexes: Array<{ name?: string }>;
    try {
      indexes = await this.runs.listIndexes().toArray();
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 26) return;
      throw cause;
    }
    if (!indexes.some((index) => index.name === "runs_tenant_idempotency_unique")) return;
    await this.runs.createIndex(
      { tenantId: 1, actorId: 1, idempotencyKey: 1 },
      { unique: true, name: "runs_tenant_actor_idempotency_unique" },
    );
    try {
      await this.runs.dropIndex("runs_tenant_idempotency_unique");
    } catch (cause) {
      if (!(cause instanceof MongoServerError && cause.code === 27)) throw cause;
    }
  }
}

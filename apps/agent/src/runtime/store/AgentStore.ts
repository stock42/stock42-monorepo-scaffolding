import {
  AgentRunSchema,
  type AgentRun,
  type AgentRunEvent,
  type AgentRunStatus,
  type InternalRunEnvelope,
} from "@stock42/contracts/agent";
import { MongoClient, MongoServerError, type Collection, type Db, type WithId } from "mongodb";
import type { AgentConfig } from "@/config";
import type {
  ConfirmationDocument,
  MessageDocument,
  ProcessDocument,
  RunDocument,
  RunEventDocument,
} from "../contracts/types";
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

const activeStatuses: AgentRunStatus[] = ["starting", "running", "cancel_requested"];

const transitions: Record<AgentRunStatus, AgentRunStatus[]> = {
  queued: ["starting", "cancelled"],
  starting: ["running", "cancel_requested", "failed", "cancelled", "crashed"],
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
    await Promise.all([
      this.runs.createIndex(
        { tenantId: 1, idempotencyKey: 1 },
        { unique: true, name: "runs_tenant_idempotency_unique" },
      ),
      this.runs.createIndex({ status: 1, createdAt: 1 }, { name: "runs_claim_queue" }),
      this.runs.createIndex({ tenantId: 1, status: 1 }, { name: "runs_tenant_status" }),
      this.runs.createIndex(
        { status: 1, heartbeatAt: 1, deadlineAt: 1 },
        { name: "runs_supervision" },
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
      this.confirmations.createIndex(
        { uuid: 1 },
        { unique: true, name: "confirmations_uuid_unique" },
      ),
      this.confirmations.createIndex({ runId: 1, status: 1 }, { name: "confirmations_run_status" }),
      this.confirmations.createIndex({ expiresAt: 1 }, { name: "confirmations_expiry" }),
      this.processes.createIndex({ runId: 1, startedAt: -1 }, { name: "processes_run_started" }),
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
    ]);
  }

  async enqueue(envelope: InternalRunEnvelope): Promise<AgentRun> {
    const existing = await this.runs.findOne({
      tenantId: envelope.tenantId,
      idempotencyKey: envelope.request.idempotencyKey,
    });
    if (existing) return this.toPublicRun(existing);

    const now = new Date();
    const conversationId = envelope.request.conversationId ?? crypto.randomUUID();
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
    };

    try {
      await this.runs.insertOne(run);
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        const raced = await this.runs.findOne({
          tenantId: envelope.tenantId,
          idempotencyKey: envelope.request.idempotencyKey,
        });
        if (raced) return this.toPublicRun(raced);
      }
      throw cause;
    }

    await this.conversations.updateOne(
      { uuid: conversationId, tenantId: envelope.tenantId },
      {
        $setOnInsert: {
          uuid: conversationId,
          tenantId: envelope.tenantId,
          actorId: envelope.actorId,
          title: envelope.request.task.slice(0, 120),
          createdAt: now.toISOString(),
        },
        $set: { updatedAt: now.toISOString() },
      },
      { upsert: true },
    );
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

  async listEvents(runId: string, tenantId: string, cursor: number) {
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

  async heartbeat(runId: string, progress = false): Promise<void> {
    const now = new Date().toISOString();
    await this.runs.updateOne(
      { uuid: runId, status: { $in: ["starting", "running", "cancel_requested"] } },
      {
        $set: {
          heartbeatAt: now,
          ...(progress ? { progressAt: now } : {}),
          updatedAt: now,
        },
      },
    );
  }

  async transition(
    runId: string,
    status: AgentRunStatus,
    updates: Partial<RunDocument> = {},
  ): Promise<RunDocument> {
    const current = await this.runs.findOne({ uuid: runId });
    if (!current) throw new Error(`Run no encontrado: ${runId}`);
    if (current.status === status) return current;
    if (!transitions[current.status].includes(status)) {
      throw new Error(`Transición inválida: ${current.status} -> ${status}`);
    }
    const now = new Date().toISOString();
    const terminal = terminalStatuses.has(status);
    const updated = await this.runs.findOneAndUpdate(
      { uuid: runId, status: current.status },
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
    if (!updated) return this.transition(runId, status, updates);
    await this.appendEvent(runId, "run.status", {
      status,
      ...(updated.terminalReason ? { reason: updated.terminalReason } : {}),
    });
    return updated;
  }

  async requestCancellation(runId: string, tenantId: string): Promise<RunDocument | null> {
    const run = await this.runs.findOne({ uuid: runId, tenantId });
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

  async noteTerminationRequested(runId: string, reason: string): Promise<void> {
    await this.runs.updateOne(
      {
        uuid: runId,
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
    });
    return confirmation;
  }

  async resolveConfirmation(
    uuid: string,
    tenantId: string,
    actorId: string,
    decision: "approved" | "rejected",
  ): Promise<RunDocument | null> {
    const now = new Date().toISOString();
    const confirmation = await this.confirmations.findOneAndUpdate(
      {
        uuid,
        tenantId,
        status: "pending",
        expiresAt: { $gt: now },
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

  private get uploads(): Collection<UploadDocument> {
    return this.database.collection("agent_uploads");
  }

  private get artifacts(): Collection<ArtifactDocument> {
    return this.database.collection("agent_artifacts");
  }

  private get deliveries(): Collection<DeliveryDocument> {
    return this.database.collection("agent_deliveries");
  }
}

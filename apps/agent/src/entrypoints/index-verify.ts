import { MongoClient, type Db, type Document } from "mongodb";
import { loadAgentConfig } from "@/config";

const requiredIndexes: Record<string, string[]> = {
  agent_runs: [
    "runs_tenant_actor_idempotency_unique",
    "runs_uuid_unique",
    "runs_claim_queue",
    "runs_tenant_status",
    "runs_supervision",
    "runs_supervision_queue",
    "runs_telegram_delivery",
  ],
  agent_conversations: ["conversations_tenant_uuid_unique"],
  agent_messages: ["messages_conversation_created"],
  agent_events: ["events_run_sequence_unique", "events_tenant_run_sequence"],
  agent_confirmations: [
    "confirmations_uuid_unique",
    "confirmations_run_status",
    "confirmations_expiry",
  ],
  agent_processes: ["processes_uuid_unique", "processes_run_started"],
  agent_tool_executions: ["tool_executions_uuid_unique", "tool_executions_run_call_input_unique"],
  agent_uploads: ["uploads_uuid_unique", "uploads_tenant_owner_created"],
  agent_artifacts: ["artifacts_uuid_unique", "artifacts_tenant_run_created"],
  agent_deliveries: ["deliveries_uuid_unique", "deliveries_tenant_idempotency_unique"],
  agent_telegram_sessions: ["telegram_sessions_tenant_chat_unique"],
  agent_telegram_runtime: ["telegram_runtime_uuid_unique"],
};

const probes: Array<{
  name: string;
  collection: string;
  query: (db: Db) => Promise<Document>;
}> = [
  {
    name: "supervision queue",
    collection: "agent_runs",
    query: (db) =>
      db
        .collection("agent_runs")
        .find({ status: { $in: ["starting", "running", "cancel_requested"] } })
        .sort({ updatedAt: 1 })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "run by uuid",
    collection: "agent_runs",
    query: (db) =>
      db
        .collection("agent_runs")
        .find({ uuid: "__index_probe__" })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "telegram delivery reconciliation",
    collection: "agent_runs",
    query: (db) =>
      db
        .collection("agent_runs")
        .find({
          telegramDeliveryStatus: "pending",
          status: { $in: ["waiting", "succeeded", "failed"] },
        })
        .sort({ updatedAt: -1 })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "queue claim",
    collection: "agent_runs",
    query: (db) =>
      db
        .collection("agent_runs")
        .find({ status: "queued" })
        .sort({ createdAt: 1 })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "tenant run events",
    collection: "agent_events",
    query: (db) =>
      db
        .collection("agent_events")
        .find({ tenantId: "__index_probe__", runId: "__index_probe__", sequence: { $gt: 0 } })
        .sort({ sequence: 1 })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "pending confirmation",
    collection: "agent_confirmations",
    query: (db) =>
      db
        .collection("agent_confirmations")
        .find({ runId: "__index_probe__", status: "pending" })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "process by uuid",
    collection: "agent_processes",
    query: (db) =>
      db
        .collection("agent_processes")
        .find({ uuid: "__index_probe__" })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "tool execution idempotency",
    collection: "agent_tool_executions",
    query: (db) =>
      db
        .collection("agent_tool_executions")
        .find({
          runId: "__index_probe__",
          toolCallId: "__index_probe__",
          inputHash: "0".repeat(64),
        })
        .limit(1)
        .explain("executionStats"),
  },
  {
    name: "delivery idempotency",
    collection: "agent_deliveries",
    query: (db) =>
      db
        .collection("agent_deliveries")
        .find({ tenantId: "__index_probe__", idempotencyKey: "__index_probe__" })
        .limit(1)
        .explain("executionStats"),
  },
];

function collectIndexNames(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectIndexNames(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, item] of Object.entries(value)) {
    if (key === "indexName" && typeof item === "string") result.add(item);
    else collectIndexNames(item, result);
  }
  return result;
}

function winningPlan(explanation: Document): unknown {
  const queryPlanner = explanation.queryPlanner;
  return queryPlanner && typeof queryPlanner === "object"
    ? (queryPlanner as Document).winningPlan
    : null;
}

const config = loadAgentConfig();
const client = new MongoClient(config.mongo.uri);
let failed = false;

try {
  await client.connect();
  const db = client.db(config.mongo.database);
  await db.command({ ping: 1 });

  for (const [collectionName, expected] of Object.entries(requiredIndexes)) {
    const actual = new Set(
      (await db.collection(collectionName).listIndexes().toArray()).map((index) => index.name),
    );
    const missing = expected.filter((name) => !actual.has(name));
    if (missing.length) failed = true;
    console.info("Agent index inventory", {
      collection: collectionName,
      status: missing.length ? "missing" : "ok",
      missing,
    });
  }

  for (const probe of probes) {
    const explanation = await probe.query(db);
    const indexes = [...collectIndexNames(winningPlan(explanation))];
    if (!indexes.length) failed = true;
    console.info("Agent index explain", {
      probe: probe.name,
      collection: probe.collection,
      status: indexes.length ? "indexed" : "collection-scan",
      indexes,
    });
  }
} finally {
  await client.close();
}

if (failed) throw new Error("La verificación de índices del agente encontró faltantes o COLLSCAN.");

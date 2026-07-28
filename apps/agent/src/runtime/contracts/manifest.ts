import { CreateAgentRunInputSchema } from "@stock42/contracts/agent";
import { z } from "zod";
import type { AgentConfig } from "@/config";
import type { AgentManifest } from "./types";

export function createAssistantManifest(config: AgentConfig): AgentManifest {
  return {
    id: "assistant",
    version: "1.0.0",
    kind: "subagent",
    inputSchema: CreateAgentRunInputSchema,
    outputSchema: z.object({ answer: z.string().min(1) }),
    actionLevel: "A3",
    envAllowlist: [
      "MONGODB_URI",
      "MONGODB_DB",
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_BASE_URL",
      "DEEPSEEK_MODEL",
      "DEEPSEEK_REASONING_EFFORT",
      "UPLOAD_STORAGE_PATH",
      "ARTIFACT_STORAGE_PATH",
      "MAX_UPLOAD_BYTES",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_POLLING_ENABLED",
      "AGENT_HEARTBEAT_MS",
      "AGENT_INACTIVITY_TIMEOUT_MS",
      "AGENT_RUN_TIMEOUT_MS",
      "AGENT_CANCEL_GRACE_MS",
      "AGENT_SERVICE_TOKEN",
      "NODE_ENV",
    ],
    heartbeatMs: config.runtime.heartbeatMs,
    inactivityTimeoutMs: config.runtime.inactivityTimeoutMs,
    timeoutMs: config.runtime.runTimeoutMs,
    cancelGraceMs: config.runtime.cancelGraceMs,
    concurrency: {
      global: config.runtime.globalConcurrency,
      perTenant: config.runtime.tenantConcurrency,
    },
    retry: { limit: 1 },
    events: [
      "run.status",
      "run.progress",
      "message",
      "tool.requested",
      "tool.completed",
      "confirmation.required",
      "confirmation.resolved",
      "artifact.created",
    ],
  };
}

export class ManifestRegistry {
  private readonly manifests = new Map<string, AgentManifest>();

  constructor(config: AgentConfig) {
    const assistant = createAssistantManifest(config);
    this.manifests.set(assistant.id, assistant);
  }

  get(id: string): AgentManifest {
    const manifest = this.manifests.get(id);
    if (!manifest) throw new Error(`Manifest no registrado: ${id}`);
    return manifest;
  }
}

import { createHash } from "node:crypto";
import type { AgentConfig } from "@/config";
import { DeepSeekClient, type DeepSeekMessage } from "@/providers/deepseek/DeepSeekClient";
import type { ManifestRegistry } from "@/runtime/contracts/manifest";
import type {
  ConfirmationDocument,
  MessageDocument,
  RunDocument,
  ToolDefinition,
} from "@/runtime/contracts/types";
import type { AgentStore } from "@/runtime/store/AgentStore";
import type { ToolRegistry } from "@/tools/registry/ToolRegistry";

class WaitingForConfirmation extends Error {}

export class AgentOrchestrator {
  private readonly deepseek: DeepSeekClient;

  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
    private readonly manifests: ManifestRegistry,
    private readonly tools: ToolRegistry,
  ) {
    this.deepseek = new DeepSeekClient(config.deepseek);
  }

  async execute(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    this.manifests.get(run.manifest).inputSchema.parse(run.input);
    const heartbeat = setInterval(
      () => void this.store.heartbeat(runId),
      Math.max(1_000, this.config.runtime.heartbeatMs),
    );

    try {
      await this.resumeResolvedConfirmation(run);
      await this.loop(await this.requireRun(runId));
    } catch (cause) {
      if (cause instanceof WaitingForConfirmation) return;
      const latest = await this.requireRun(runId);
      if (latest.status === "cancel_requested") {
        await this.store.transition(runId, "cancelled", {
          terminalReason: "cancelled_by_actor",
        });
        return;
      }
      if (!["waiting", "succeeded", "failed", "cancelled"].includes(latest.status)) {
        await this.store.transition(runId, "failed", {
          terminalReason: cause instanceof Error ? cause.message.slice(0, 240) : "runtime_error",
        });
      }
      throw cause;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async loop(run: RunDocument): Promise<void> {
    const storedMessages = await this.store.messagesForConversation(
      run.conversationId,
      run.tenantId,
    );
    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are the Stock42 tenant assistant. Respect tenant boundaries. Never claim a tool effect before its tool result. Critical tools require human confirmation.",
      },
      ...storedMessages.map((message) => this.toProviderMessage(message)),
    ];

    for (let step = 0; step < 12; step += 1) {
      await this.ensureNotCancelled(run.uuid);
      const assistant = await this.deepseek.complete(messages, this.tools.list());
      const stored: MessageDocument = {
        uuid: crypto.randomUUID(),
        conversationId: run.conversationId,
        runId: run.uuid,
        tenantId: run.tenantId,
        role: "assistant",
        content: assistant.content,
        reasoningContent: assistant.reasoning_content ?? null,
        toolCalls: assistant.tool_calls ?? [],
        toolCallId: null,
        name: null,
        createdAt: new Date().toISOString(),
      };
      await this.store.addMessage(stored);
      await this.store.appendEvent(run.uuid, "message", {
        role: "assistant",
        hasContent: Boolean(assistant.content),
        toolCallCount: assistant.tool_calls?.length ?? 0,
      });
      messages.push(this.toProviderMessage(stored));

      if (!assistant.tool_calls?.length) {
        const answer = assistant.content?.trim();
        if (!answer) throw new Error("DeepSeek devolvió una respuesta vacía.");
        await this.store.transition(run.uuid, "succeeded", {
          output: { answer },
          terminalReason: null,
        });
        return;
      }

      for (const toolCall of assistant.tool_calls) {
        const result = await this.executeTool(run, toolCall);
        if (result === undefined) throw new WaitingForConfirmation();
        const toolMessage: MessageDocument = {
          uuid: crypto.randomUUID(),
          conversationId: run.conversationId,
          runId: run.uuid,
          tenantId: run.tenantId,
          role: "tool",
          content: JSON.stringify(result),
          reasoningContent: null,
          toolCalls: [],
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          createdAt: new Date().toISOString(),
        };
        await this.store.addMessage(toolMessage);
        messages.push(this.toProviderMessage(toolMessage));
      }
      await this.store.heartbeat(run.uuid, true);
    }
    throw new Error("Se alcanzó el máximo de pasos del agente.");
  }

  private async executeTool(
    run: RunDocument,
    toolCall: {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    },
  ): Promise<unknown | undefined> {
    let tool: ToolDefinition;
    try {
      tool = this.tools.get(toolCall.function.name);
    } catch {
      return { ok: false, error: "Tool not registered" };
    }
    if (!tool.allowedRoles.includes(run.actorRole)) {
      return { ok: false, error: "Tool forbidden for actor role" };
    }

    let rawInput: unknown;
    try {
      rawInput = JSON.parse(toolCall.function.arguments);
    } catch {
      return { ok: false, error: "Tool arguments are not valid JSON" };
    }
    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      return { ok: false, error: "Tool arguments do not match the contract" };
    }
    await this.store.appendEvent(run.uuid, "tool.requested", {
      toolName: tool.name,
      toolCallId: toolCall.id,
      actionClass: tool.actionClass,
    });

    if (tool.actionClass === "critical") {
      await this.store.createConfirmation({
        runId: run.uuid,
        tenantId: run.tenantId,
        actorId: run.actorId,
        toolName: tool.name,
        input: parsedInput.data,
        inputHash: createHash("sha256").update(JSON.stringify(parsedInput.data)).digest("hex"),
        toolCallId: toolCall.id,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      await this.store.transition(run.uuid, "waiting", {
        processId: null,
        pid: null,
      });
      return undefined;
    }
    return this.performTool(run, tool, parsedInput.data, toolCall.id);
  }

  private async performTool(
    run: RunDocument,
    tool: ToolDefinition,
    input: unknown,
    toolCallId: string,
  ): Promise<unknown> {
    const output = await Promise.race([
      tool.execute(input, { run, actorRole: run.actorRole }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`Tool timeout: ${tool.name}`)), tool.timeoutMs),
      ),
    ]);
    const parsed = tool.outputSchema.parse(output);
    await this.store.appendEvent(run.uuid, "tool.completed", {
      toolName: tool.name,
      toolCallId,
      ok: true,
    });
    return { ok: true, data: parsed };
  }

  private async resumeResolvedConfirmation(run: RunDocument): Promise<void> {
    const confirmation = await this.store.nextResolvedConfirmation(run.uuid);
    if (!confirmation) return;
    const result = await this.confirmationResult(run, confirmation);
    await this.store.addMessage({
      uuid: crypto.randomUUID(),
      conversationId: run.conversationId,
      runId: run.uuid,
      tenantId: run.tenantId,
      role: "tool",
      content: JSON.stringify(result),
      reasoningContent: null,
      toolCalls: [],
      toolCallId: confirmation.toolCallId,
      name: confirmation.toolName,
      createdAt: new Date().toISOString(),
    });
    await this.store.markConfirmationExecuted(confirmation.uuid);
  }

  private async confirmationResult(
    run: RunDocument,
    confirmation: ConfirmationDocument,
  ): Promise<unknown> {
    if (confirmation.status !== "approved") {
      return { ok: false, error: "Human confirmation rejected or expired" };
    }
    const tool = this.tools.get(confirmation.toolName);
    const input = tool.inputSchema.parse(confirmation.input);
    return this.performTool(run, tool, input, confirmation.toolCallId);
  }

  private toProviderMessage(message: MessageDocument): DeepSeekMessage {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        reasoning_content: message.reasoningContent,
        ...(message.toolCalls.length ? { tool_calls: message.toolCalls } : {}),
      };
    }
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId ?? "",
        name: message.name ?? undefined,
      };
    }
    return { role: message.role, content: message.content };
  }

  private async ensureNotCancelled(runId: string): Promise<void> {
    const run = await this.requireRun(runId);
    if (run.status === "cancel_requested") throw new Error("cancel_requested");
  }

  private async requireRun(runId: string): Promise<RunDocument> {
    const run = await this.store.getRun(runId);
    if (!run) throw new Error(`Run no encontrado: ${runId}`);
    return run;
  }
}

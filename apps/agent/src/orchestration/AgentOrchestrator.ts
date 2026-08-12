import { createHash } from "node:crypto";
import { AgentRunProgressSchema, type AgentRunProgress } from "@stock42/contracts/agent";
import type { AgentConfig } from "@/config";
import { DeepSeekClient, type DeepSeekMessage } from "@/providers/deepseek/DeepSeekClient";
import type { ManifestRegistry } from "@/runtime/contracts/manifest";
import type {
  ConfirmationDocument,
  MessageDocument,
  RunDocument,
  ToolDefinition,
  ToolContext,
} from "@/runtime/contracts/types";
import { AgentAttemptInactiveError, type AgentStore } from "@/runtime/store/AgentStore";
import type { ToolRegistry } from "@/tools/registry/ToolRegistry";

class WaitingForConfirmation extends Error {}

function boundedSignal(parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("tool_timeout")), timeoutMs);
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent.removeEventListener("abort", abort);
    },
  };
}

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

  async execute(runId: string, processId: string, signal: AbortSignal): Promise<void> {
    const run = await this.requireRun(runId);
    this.manifests.get(run.manifest).inputSchema.parse(run.input);
    const heartbeat = setInterval(
      () => void this.store.heartbeat(runId, processId).catch(() => undefined),
      Math.max(1_000, this.config.runtime.heartbeatMs),
    );

    try {
      await this.resumeResolvedConfirmation(run, processId, signal);
      await this.loop(await this.requireRun(runId), processId, signal);
    } catch (cause) {
      if (cause instanceof WaitingForConfirmation) return;
      const latest = await this.requireRun(runId);
      if (latest.status === "cancel_requested") {
        await this.store.transition(
          runId,
          "cancelled",
          {
            terminalReason: "cancelled_by_actor",
          },
          processId,
        );
        return;
      }
      if (cause instanceof AgentAttemptInactiveError || latest.terminationRequestedAt) throw cause;
      if (!["waiting", "succeeded", "failed", "cancelled"].includes(latest.status)) {
        await this.store.transition(
          runId,
          "failed",
          {
            terminalReason: cause instanceof Error ? cause.message.slice(0, 240) : "runtime_error",
          },
          processId,
        );
      }
      throw cause;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async loop(run: RunDocument, processId: string, signal: AbortSignal): Promise<void> {
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
      await this.assertActive(run.uuid, processId, signal);
      await this.progress(run.uuid, {
        stage: "analyzing",
        message:
          step === 0
            ? "Analizando la solicitud y seleccionando herramientas..."
            : "Analizando los resultados y definiendo el siguiente paso...",
        step: step + 1,
      });
      const assistant = await this.deepseek.complete(messages, this.tools.list(), signal);
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
        await this.progress(run.uuid, {
          stage: "responding",
          message: "Preparando la respuesta final...",
          step: step + 1,
        });
        await this.store.transition(
          run.uuid,
          "succeeded",
          {
            output: { answer },
            terminalReason: null,
          },
          processId,
        );
        return;
      }

      for (const toolCall of assistant.tool_calls) {
        const result = await this.executeTool(run, processId, signal, toolCall);
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
      await this.store.heartbeat(run.uuid, processId, true);
    }
    throw new Error("Se alcanzó el máximo de pasos del agente.");
  }

  private async executeTool(
    run: RunDocument,
    processId: string,
    signal: AbortSignal,
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

    const context = this.toolContext(run, processId, signal);
    await context.assertActive();

    if (tool.actionClass === "critical") {
      await this.progress(run.uuid, {
        stage: "waiting_confirmation",
        message: `Esperando confirmación para ${tool.name}...`,
        toolName: tool.name,
      });
      const preview = tool.confirmationPreview
        ? await tool.confirmationPreview(parsedInput.data, context)
        : null;
      await this.store.createConfirmation({
        runId: run.uuid,
        tenantId: run.tenantId,
        actorId: run.actorId,
        toolName: tool.name,
        input: parsedInput.data,
        inputHash: createHash("sha256").update(JSON.stringify(parsedInput.data)).digest("hex"),
        preview,
        toolCallId: toolCall.id,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      await this.store.transition(
        run.uuid,
        "waiting",
        {
          processId: null,
          pid: null,
        },
        processId,
      );
      return undefined;
    }
    return this.performTool(run, processId, signal, tool, parsedInput.data, toolCall.id);
  }

  private async performTool(
    run: RunDocument,
    processId: string,
    processSignal: AbortSignal,
    tool: ToolDefinition,
    input: unknown,
    toolCallId: string,
  ): Promise<unknown> {
    await this.progress(run.uuid, {
      stage: "tool_started",
      message: `Ejecutando ${tool.name}...`,
      toolName: tool.name,
    });
    const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const claim = await this.store.beginToolExecution({
      run,
      processId,
      toolCallId,
      toolName: tool.name,
      inputHash,
      idempotent: tool.idempotent,
    });
    if (claim.kind === "cached") {
      await this.store.appendEvent(run.uuid, "tool.completed", {
        toolName: tool.name,
        toolCallId,
        ok: true,
        cached: true,
      });
      await this.progress(run.uuid, {
        stage: "tool_completed",
        message: `${tool.name} completada. Analizando el resultado...`,
        toolName: tool.name,
      });
      return claim.output;
    }

    const bounded = boundedSignal(processSignal, tool.timeoutMs);
    const context = this.toolContext(run, processId, bounded.signal);
    try {
      const output = await tool.execute(input, context);
      const parsed = tool.outputSchema.parse(output);
      const result = { ok: true, data: parsed };
      await this.store.completeToolExecution(claim.execution.uuid, processId, result);
      await this.store.appendEvent(run.uuid, "tool.completed", {
        toolName: tool.name,
        toolCallId,
        ok: true,
      });
      await this.progress(run.uuid, {
        stage: "tool_completed",
        message: `${tool.name} completada. Analizando el resultado...`,
        toolName: tool.name,
      });
      return result;
    } catch (cause) {
      await this.store.failToolExecution(claim.execution.uuid, processId, cause);
      await this.store.appendEvent(run.uuid, "tool.completed", {
        toolName: tool.name,
        toolCallId,
        ok: false,
      });
      await this.progress(run.uuid, {
        stage: "tool_failed",
        message: `${tool.name} falló. Evaluando el resultado...`,
        toolName: tool.name,
      });
      if (bounded.signal.aborted && !processSignal.aborted) {
        throw new Error(`Tool timeout: ${tool.name}`);
      }
      throw cause;
    } finally {
      bounded.cleanup();
    }
  }

  private async resumeResolvedConfirmation(
    run: RunDocument,
    processId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const confirmation = await this.store.nextResolvedConfirmation(run.uuid);
    if (!confirmation) return;
    const result = await this.confirmationResult(run, processId, signal, confirmation);
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
    processId: string,
    signal: AbortSignal,
    confirmation: ConfirmationDocument,
  ): Promise<unknown> {
    if (confirmation.status !== "approved") {
      return { ok: false, error: "Human confirmation rejected or expired" };
    }
    const tool = this.tools.get(confirmation.toolName);
    const input = tool.inputSchema.parse(confirmation.input);
    return this.performTool(run, processId, signal, tool, input, confirmation.toolCallId);
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

  private toolContext(run: RunDocument, processId: string, signal: AbortSignal): ToolContext {
    return {
      run,
      actorRole: run.actorRole,
      processId,
      signal,
      assertActive: () => this.assertActive(run.uuid, processId, signal),
    };
  }

  private async assertActive(runId: string, processId: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("agent_process_aborted");
    }
    await this.store.assertActiveAttempt(runId, processId);
  }

  private async progress(runId: string, progress: AgentRunProgress): Promise<void> {
    await this.store.appendEvent(runId, "run.progress", AgentRunProgressSchema.parse(progress));
  }

  private async requireRun(runId: string): Promise<RunDocument> {
    const run = await this.store.getRun(runId);
    if (!run) throw new Error(`Run no encontrado: ${runId}`);
    return run;
  }
}

import {
  InternalRunEnvelopeSchema,
  ResolveConfirmationInputSchema,
} from "@stock42/contracts/agent";
import { UploadIntentInputSchema } from "@stock42/contracts/files";
import type { AgentConfig } from "@/config";
import type { AgentStore } from "@/runtime/store/AgentStore";
import { AgentResourceNotFoundError } from "@/runtime/store/AgentStore";
import type { ToolRegistry } from "@/tools/registry/ToolRegistry";
import { authenticateServiceRequest } from "./service-auth";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function publicError(status: number, message: string): Response {
  return json(
    {
      ok: false,
      error: {
        code: status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
        message,
        errorId: crypto.randomUUID(),
      },
    },
    status,
  );
}

async function telegramHealth(config: AgentConfig, store: AgentStore) {
  if (!config.telegram.pollingEnabled) {
    return { enabled: false, state: "disabled", running: false };
  }
  const status = await store.telegramRuntimeStatus();
  if (!status) {
    return {
      enabled: true,
      state: "degraded",
      running: false,
      restartCount: 0,
      lastError: "El supervisor todavía no publicó estado.",
    };
  }
  const staleAfterMs =
    config.telegram.pollTimeoutSeconds * 1_000 + config.telegram.backoffMaxMs + 10_000;
  const stale =
    !status.heartbeatAt || Date.now() - new Date(status.heartbeatAt).getTime() > staleAfterMs;
  return {
    enabled: true,
    state: stale ? "degraded" : status.state,
    running: status.running && !stale,
    restartCount: status.restartCount,
    lastUpdateAt: status.lastUpdateAt,
    lastErrorAt: status.lastErrorAt,
    lastError: stale ? "El heartbeat de Telegram está vencido." : status.lastError,
    nextRetryAt: status.nextRetryAt,
  };
}

export function startInternalServer(
  config: AgentConfig,
  store: AgentStore,
  tools: ToolRegistry,
): Bun.Server<undefined> {
  return Bun.serve({
    hostname: config.host,
    port: config.port,
    maxRequestBodySize: config.storage.maxUploadBytes + 1024,
    idleTimeout: 30,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/internal/health/live") {
        const telegram = await telegramHealth(config, store);
        return json({
          ok: true,
          data: {
            status:
              telegram.state === "disabled" || telegram.state === "polling" ? "ok" : "degraded",
            telegram,
          },
        });
      }

      const body = new Uint8Array(await request.arrayBuffer());
      let serviceContext: ReturnType<typeof authenticateServiceRequest>;
      try {
        serviceContext = authenticateServiceRequest(request, body, config);
      } catch {
        return publicError(401, "Solicitud de servicio no autorizada.");
      }

      try {
        if (request.method === "GET" && url.pathname === "/internal/health/ready") {
          const telegram = await telegramHealth(config, store);
          return json({
            ok: true,
            data: {
              status:
                telegram.state === "disabled" || telegram.state === "polling"
                  ? "ready"
                  : "degraded",
              mongodb: "ready",
              telegram,
            },
          });
        }

        if (request.method === "POST" && url.pathname === "/internal/runs") {
          const envelope = InternalRunEnvelopeSchema.parse(
            JSON.parse(new TextDecoder().decode(body)),
          );
          if (
            envelope.tenantId !== serviceContext.tenantId ||
            envelope.actorId !== serviceContext.actorId ||
            envelope.actorRole !== serviceContext.actorRole
          ) {
            return publicError(403, "El contexto firmado no coincide con el contrato.");
          }
          const run = await store.enqueue(envelope);
          return json({ ok: true, data: run }, 202);
        }

        const eventsMatch = url.pathname.match(/^\/internal\/runs\/([0-9a-f-]{36})\/events$/);
        if (request.method === "GET" && eventsMatch?.[1]) {
          const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
          if (!Number.isInteger(cursor) || cursor < 0) return publicError(400, "Cursor inválido.");
          const result = await store.listEvents(
            eventsMatch[1],
            serviceContext.tenantId,
            serviceContext,
            cursor,
          );
          if (!result) return publicError(404, "Run no encontrado.");
          return json({ ok: true, data: result });
        }

        const cancelMatch = url.pathname.match(/^\/internal\/runs\/([0-9a-f-]{36})\/cancel$/);
        if (request.method === "POST" && cancelMatch?.[1]) {
          const run = await store.requestCancellation(
            cancelMatch[1],
            serviceContext.tenantId,
            serviceContext,
          );
          if (!run) return publicError(404, "Run no encontrado.");
          return json({ ok: true, data: store.toPublicRun(run) });
        }

        const runMatch = url.pathname.match(/^\/internal\/runs\/([0-9a-f-]{36})$/);
        if (request.method === "GET" && runMatch?.[1]) {
          const run = await store.getRunForActor(
            runMatch[1],
            serviceContext.tenantId,
            serviceContext,
          );
          if (!run) return publicError(404, "Run no encontrado.");
          return json({ ok: true, data: store.toPublicRun(run) });
        }

        const confirmationMatch = url.pathname.match(
          /^\/internal\/confirmations\/([0-9a-f-]{36})$/,
        );
        if (request.method === "POST" && confirmationMatch?.[1]) {
          const input = ResolveConfirmationInputSchema.parse(
            JSON.parse(new TextDecoder().decode(body)),
          );
          const run = await store.resolveConfirmation(
            confirmationMatch[1],
            serviceContext.tenantId,
            serviceContext.actorId,
            serviceContext.actorRole,
            input.decision,
          );
          if (!run) return publicError(404, "Confirmation no encontrada o ya resuelta.");
          return json({ ok: true, data: store.toPublicRun(run) });
        }

        if (request.method === "POST" && url.pathname === "/internal/uploads/intents") {
          const input = UploadIntentInputSchema.parse(JSON.parse(new TextDecoder().decode(body)));
          const upload = await tools.uploads.createIntent(input, {
            tenantId: serviceContext.tenantId,
            ownerId: serviceContext.actorId,
          });
          return json(
            {
              ok: true,
              data: {
                upload: {
                  uuid: upload.uuid,
                  tenantId: upload.tenantId,
                  ownerId: upload.ownerId,
                  fileName: upload.fileName,
                  mimeType: upload.mimeType,
                  size: upload.declaredSize,
                  sha256: upload.expectedSha256,
                  status: upload.status,
                  createdAt: upload.createdAt,
                },
                uploadUrl: `/internal/uploads/${upload.uuid}/content`,
                requiredHeaders: { "content-type": "application/octet-stream" },
              },
            },
            201,
          );
        }

        const uploadMatch = url.pathname.match(/^\/internal\/uploads\/([0-9a-f-]{36})\/content$/);
        if (request.method === "PUT" && uploadMatch?.[1]) {
          const upload = await tools.uploads.write(
            uploadMatch[1],
            serviceContext.tenantId,
            serviceContext.actorId,
            body,
          );
          return json({
            ok: true,
            data: {
              uuid: upload.uuid,
              tenantId: upload.tenantId,
              ownerId: upload.ownerId,
              fileName: upload.fileName,
              mimeType: upload.mimeType,
              size: upload.size,
              sha256: upload.sha256,
              status: upload.status,
              createdAt: upload.createdAt,
            },
          });
        }

        const artifactMatch = url.pathname.match(/^\/internal\/artifacts\/([0-9a-f-]{36})$/);
        if (request.method === "GET" && artifactMatch?.[1]) {
          const result = await tools.artifacts.get(
            artifactMatch[1],
            serviceContext.tenantId,
            serviceContext,
          );
          if (!result) return publicError(404, "Artifact no encontrado.");
          return new Response(result.file, {
            headers: {
              "content-type": result.artifact.mimeType,
              "content-length": String(result.artifact.size),
              "content-disposition": `attachment; filename="${result.artifact.fileName.replaceAll('"', "")}"`,
              "x-artifact-sha256": result.artifact.sha256,
            },
          });
        }

        return publicError(404, "Endpoint interno no encontrado.");
      } catch (cause) {
        if (cause instanceof AgentResourceNotFoundError) {
          return publicError(404, "Recurso no encontrado.");
        }
        const errorId = crypto.randomUUID();
        console.error("Agent internal request failed", {
          errorId,
          method: request.method,
          path: url.pathname,
          error: cause,
        });
        return json(
          {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "La operación interna falló.",
              errorId,
            },
          },
          500,
        );
      }
    },
    error(cause) {
      console.error("Agent server failure", cause);
      return publicError(500, "Error interno.");
    },
  });
}

import {
  AgentRunEventsResponseSchema,
  AgentRunResponseSchema,
  type InternalRunEnvelope,
} from "@stock42/contracts/agent";
import {
  UploadIntentResponseSchema,
  UploadSchema,
  type UploadIntentInput,
} from "@stock42/contracts/files";
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { ApiConfig } from "@/config";
import { HttpError } from "@/errors/HttpError";

export class AgentClient {
  constructor(private readonly config: ApiConfig["agent"]) {}

  async createRun(envelope: InternalRunEnvelope) {
    return this.request("/internal/runs", AgentRunResponseSchema, {
      method: "POST",
      body: envelope,
      idempotencyKey: envelope.request.idempotencyKey,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
    });
  }

  async getRun(runId: string, tenantId: string, actorId: string) {
    return this.request(`/internal/runs/${encodeURIComponent(runId)}`, AgentRunResponseSchema, {
      method: "GET",
      tenantId,
      actorId,
    });
  }

  async cancelRun(runId: string, tenantId: string, actorId: string) {
    return this.request(
      `/internal/runs/${encodeURIComponent(runId)}/cancel`,
      AgentRunResponseSchema,
      {
        method: "POST",
        tenantId,
        actorId,
        idempotencyKey: `cancel:${runId}`,
      },
    );
  }

  async resolveConfirmation(
    confirmationId: string,
    decision: "approved" | "rejected",
    tenantId: string,
    actorId: string,
  ) {
    return this.request(
      `/internal/confirmations/${encodeURIComponent(confirmationId)}`,
      AgentRunResponseSchema,
      {
        method: "POST",
        body: { decision },
        tenantId,
        actorId,
        idempotencyKey: `confirmation:${confirmationId}:${decision}`,
      },
    );
  }

  async events(runId: string, tenantId: string, actorId: string, cursor: number) {
    return this.request(
      `/internal/runs/${encodeURIComponent(runId)}/events?cursor=${cursor}`,
      AgentRunEventsResponseSchema,
      { method: "GET", tenantId, actorId },
    );
  }

  async createUploadIntent(input: UploadIntentInput, tenantId: string, actorId: string) {
    return this.request("/internal/uploads/intents", UploadIntentResponseSchema, {
      method: "POST",
      body: input,
      tenantId,
      actorId,
      idempotencyKey: `upload-intent:${input.sha256}`,
    });
  }

  async uploadContent(uploadId: string, bytes: Uint8Array, tenantId: string, actorId: string) {
    const response = await this.signedFetch(
      `/internal/uploads/${encodeURIComponent(uploadId)}/content`,
      {
        method: "PUT",
        bytes,
        tenantId,
        actorId,
        contentType: "application/octet-stream",
      },
    );
    return this.parseJson(response, z.object({ ok: z.literal(true), data: UploadSchema }));
  }

  async artifact(artifactId: string, tenantId: string, actorId: string): Promise<Response> {
    return this.signedFetch(`/internal/artifacts/${encodeURIComponent(artifactId)}`, {
      method: "GET",
      tenantId,
      actorId,
    });
  }

  private async request<TSchema extends z.ZodType>(
    path: `/${string}`,
    schema: TSchema,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      idempotencyKey?: string;
      tenantId: string;
      actorId: string;
    },
  ): Promise<z.infer<TSchema>> {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const response = await this.signedFetch(path, {
      method: options.method,
      bytes: body === undefined ? undefined : new TextEncoder().encode(body),
      idempotencyKey: options.idempotencyKey,
      tenantId: options.tenantId,
      actorId: options.actorId,
      contentType: "application/json",
    });
    return this.parseJson(response, schema);
  }

  private async signedFetch(
    path: `/${string}`,
    options: {
      method: "GET" | "POST" | "PUT";
      bytes?: Uint8Array;
      idempotencyKey?: string;
      tenantId: string;
      actorId: string;
      contentType?: string;
    },
  ): Promise<Response> {
    const timestamp = Date.now().toString();
    const url = new URL(path, this.config.url);
    const signatureBuilder = createHmac("sha256", this.config.serviceToken).update(
      `${timestamp}\n${options.method}\n${url.pathname}${url.search}\n`,
    );
    if (options.bytes) signatureBuilder.update(options.bytes);
    const signature = signatureBuilder.digest("base64url");
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${this.config.serviceToken}`,
      "content-type": options.contentType ?? "application/json",
      "x-service-timestamp": timestamp,
      "x-service-signature": signature,
      "x-tenant-id": options.tenantId,
      "x-actor-id": options.actorId,
    });
    if (options.idempotencyKey) headers.set("x-idempotency-key", options.idempotencyKey);

    try {
      return await fetch(url, {
        method: options.method,
        headers,
        body: options.bytes,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new HttpError(502, "UPSTREAM_ERROR", "El runtime de agentes no está disponible.");
    }
  }

  private async parseJson<TSchema extends z.ZodType>(
    response: Response,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new HttpError(502, "UPSTREAM_ERROR", "El runtime de agentes respondió inválidamente.");
    }
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new HttpError(502, "UPSTREAM_ERROR", "El runtime de agentes rechazó la operación.");
    }
    return schema.parse(payload);
  }
}

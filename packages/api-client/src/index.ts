import { ApiErrorSchema } from "@stock42/contracts/common";
import type { z } from "zod";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly errorId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type ApiRequestOptions<TSchema extends z.ZodType> = {
  baseUrl: string;
  path: `/${string}`;
  schema: TSchema;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  cookie?: string;
  csrfToken?: string;
  correlationId?: string;
  signal?: AbortSignal;
};

export function filterForwardHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  for (const [name, value] of headers.entries()) {
    if (!hopByHopHeaders.has(name.toLowerCase())) {
      filtered.append(name, value);
    }
  }
  return filtered;
}

export async function apiRequest<TSchema extends z.ZodType>(
  options: ApiRequestOptions<TSchema>,
): Promise<{
  data: z.infer<TSchema>;
  response: Response;
}> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.csrfToken) headers.set("x-csrf-token", options.csrfToken);
  if (options.correlationId) headers.set("x-correlation-id", options.correlationId);

  const response = await fetch(new URL(options.path, options.baseUrl), {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
    signal: options.signal,
  });

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiClientError(
      `La API respondió ${contentType || "sin Content-Type"}; se esperaba JSON.`,
      response.status,
      "INVALID_UPSTREAM_RESPONSE",
    );
  }

  const body: unknown = await response.json();
  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiClientError(
        parsedError.data.error.message,
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.errorId,
      );
    }
    throw new ApiClientError(
      "La API devolvió un error no reconocido.",
      response.status,
      "UPSTREAM_ERROR",
    );
  }

  return {
    data: options.schema.parse(body),
    response,
  };
}

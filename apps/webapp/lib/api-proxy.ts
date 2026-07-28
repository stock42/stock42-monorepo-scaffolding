import { toBrowserResponse } from "@stock42/api-client/server";
import type { z } from "zod";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

function requestHeaders(request: Request): Headers {
  const headers = new Headers({ accept: "application/json" });
  const cookie = request.headers.get("cookie");
  const csrfToken = request.headers.get("x-csrf-token");
  const correlationId = request.headers.get("x-correlation-id");

  if (cookie) headers.set("cookie", cookie);
  if (csrfToken) headers.set("x-csrf-token", csrfToken);
  if (correlationId) headers.set("x-correlation-id", correlationId);
  headers.set("content-type", "application/json");
  return headers;
}

export async function proxyApi(
  request: Request,
  path: `/${string}`,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    bodySchema?: z.ZodType;
  } = {},
): Promise<Response> {
  let body: string | undefined;

  if (options.bodySchema) {
    const raw: unknown = await request.json().catch(() => undefined);
    const parsed = options.bodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "La solicitud no cumple el contrato.",
            errorId: crypto.randomUUID(),
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }
    body = JSON.stringify(parsed.data);
  }

  try {
    const upstream = await fetch(new URL(path, apiUrl), {
      method: options.method ?? request.method,
      headers: requestHeaders(request),
      body,
      redirect: "manual",
      cache: "no-store",
    });
    return toBrowserResponse(upstream);
  } catch {
    return Response.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: "La API no está disponible.",
          errorId: crypto.randomUUID(),
        },
      },
      { status: 502 },
    );
  }
}

import type { ApiConfig } from "@/config";

export function resolveCorsOrigin(
  request: Request,
  allowedOrigins: ApiConfig["corsOrigins"],
): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === "null") return null;

  try {
    new URL(origin);
  } catch {
    return null;
  }

  return allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? origin : null;
}

export function corsPreflight(request: Request, allowedOrigins: string[]): Response | null {
  if (request.method !== "OPTIONS") return null;
  const origin = resolveCorsOrigin(request, allowedOrigins);
  if (request.headers.has("origin") && !origin) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Origin no permitido.",
          errorId: crypto.randomUUID(),
        },
      },
      { status: 403 },
    );
  }

  const headers = new Headers({
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,x-csrf-token,x-correlation-id,x-idempotency-key",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  });
  if (origin) headers.set("access-control-allow-origin", origin);
  return new Response(null, { status: 204, headers });
}

export function withCors(request: Request, response: Response, allowedOrigins: string[]): Response {
  const headers = new Headers(response.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-credentials");
  headers.delete("access-control-allow-methods");
  headers.delete("access-control-allow-headers");

  const origin = resolveCorsOrigin(request, allowedOrigins);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    const vary = headers.get("vary");
    headers.set("vary", vary ? `${vary}, Origin` : "Origin");
  }

  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

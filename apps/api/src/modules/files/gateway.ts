import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { errorResponse } from "@/errors/handler";
import { requireCsrf } from "@/security/csrf";

export async function fileGateway(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const upload = url.pathname.match(/^\/uploads\/([0-9a-f-]{36})\/content$/);
  const artifact = url.pathname.match(/^\/artifacts\/([0-9a-f-]{36})$/);
  if (!upload && !artifact) return null;

  const context = getAppContext();
  try {
    const claims = await context.auth.authenticateActive(request.headers);
    if (!claims.actor.tenantId) {
      throw new HttpError(403, "FORBIDDEN", "Tenant requerido.");
    }

    if (upload?.[1] && request.method === "PUT") {
      requireCsrf(request, claims.sid, context.config);
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (
        !Number.isInteger(contentLength) ||
        contentLength <= 0 ||
        contentLength > 10 * 1024 * 1024
      ) {
        throw new HttpError(400, "BAD_REQUEST", "Tamaño de upload inválido.");
      }
      const result = await context.agentClient.uploadContent(
        upload[1],
        new Uint8Array(await request.arrayBuffer()),
        claims.actor.tenantId,
        claims.actor.uuid,
        claims.actor.role,
      );
      return Response.json(result);
    }

    if (artifact?.[1] && request.method === "GET") {
      const upstream = await context.agentClient.artifact(
        artifact[1],
        claims.actor.tenantId,
        claims.actor.uuid,
        claims.actor.role,
      );
      if (!upstream.ok) {
        throw new HttpError(404, "NOT_FOUND", "Artifact no encontrado.");
      }
      const headers = new Headers();
      for (const name of [
        "content-type",
        "content-length",
        "content-disposition",
        "x-artifact-sha256",
      ]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(upstream.body, { status: 200, headers });
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (cause) {
    return errorResponse(cause, { method: request.method, path: url.pathname });
  }
}

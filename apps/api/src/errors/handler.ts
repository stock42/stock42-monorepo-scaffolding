import { ZodError } from "zod";
import { HttpError } from "./HttpError";

const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "password",
  "token",
  "secret",
  "refreshToken",
  "accessToken",
]);

function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? "[REDACTED]" : value,
    ]),
  );
}

export function errorResponse(cause: unknown, metadata: Record<string, unknown> = {}): Response {
  const errorId = crypto.randomUUID();

  if (cause instanceof HttpError) {
    console.info("API request rejected", {
      errorId,
      status: cause.status,
      code: cause.code,
      message: cause.message,
      metadata: safeMetadata(metadata),
    });
    return Response.json(
      {
        ok: false,
        error: {
          code: cause.code,
          message: cause.message,
          errorId,
          ...(cause.details === undefined ? {} : { details: cause.details }),
        },
      },
      { status: cause.status },
    );
  }

  if (cause instanceof ZodError) {
    console.info("API contract rejected", {
      errorId,
      issues: cause.issues,
      metadata: safeMetadata(metadata),
    });
    return Response.json(
      {
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "La solicitud no cumple el contrato.",
          errorId,
          details: cause.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", {
    errorId,
    error: cause,
    metadata: safeMetadata(metadata),
  });
  return Response.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocurrió un error interno.",
        errorId,
      },
    },
    { status: 500 },
  );
}

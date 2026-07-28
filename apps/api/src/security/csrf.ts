import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiConfig } from "@/config";
import { HttpError } from "@/errors/HttpError";

function binding(nativeToken: string, sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${sessionId}.${nativeToken}`).digest("base64url");
}

export function createCsrfToken(
  sessionId: string,
  config: ApiConfig,
  expiresInSeconds = 600,
): string {
  const nativeOptions = {
    sessionId,
    expiresIn: expiresInSeconds * 1_000,
  } as Bun.CSRFGenerateOptions & { sessionId: string };
  const nativeToken = Bun.CSRF.generate(config.auth.csrfSecret, {
    ...nativeOptions,
  });
  const bound = binding(nativeToken, sessionId, config.auth.csrfSecret);
  return `${nativeToken}.${bound}`;
}

export function verifyCsrfToken(
  token: string | null,
  sessionId: string,
  config: ApiConfig,
  maxAgeSeconds = 600,
): boolean {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const nativeToken = token.slice(0, separator);
  const suppliedBinding = token.slice(separator + 1);
  const expectedBinding = binding(nativeToken, sessionId, config.auth.csrfSecret);
  const suppliedBytes = Buffer.from(suppliedBinding);
  const expectedBytes = Buffer.from(expectedBinding);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return false;
  }

  const nativeOptions = {
    secret: config.auth.csrfSecret,
    sessionId,
    maxAge: maxAgeSeconds * 1_000,
  } as Bun.CSRFVerifyOptions & { sessionId: string };
  return Bun.CSRF.verify(nativeToken, nativeOptions);
}

export function requireCsrf(request: { headers: Headers }, sessionId: string, config: ApiConfig) {
  if (!verifyCsrfToken(request.headers.get("x-csrf-token"), sessionId, config)) {
    throw new HttpError(403, "FORBIDDEN", "Token CSRF inválido o vencido.");
  }
}

import { describe, expect, test } from "bun:test";
import type { ApiConfig } from "@/config";
import { HttpError } from "@/errors/HttpError";
import { errorResponse } from "@/errors/handler";
import { resolveCorsOrigin } from "@/http/cors";
import { AuthService } from "@/modules/auth/services/AuthService";
import { createCsrfToken, verifyCsrfToken } from "@/security/csrf";
import { RateLimiter } from "@/security/rate-limit";
import { resolveClientIp } from "@/security/client-ip";

const config = {
  auth: {
    csrfSecret: "c".repeat(32),
  },
} as ApiConfig;

describe("API security primitives", () => {
  test("adds a supplemental CSRF binding to the session", () => {
    const token = createCsrfToken("session-a", config);
    expect(verifyCsrfToken(token, "session-a", config)).toBe(true);
    expect(verifyCsrfToken(token, "session-b", config)).toBe(false);
  });

  test("reflects an allowed origin instead of wildcard with credentials", () => {
    const request = new Request("http://api.example.test", {
      headers: { origin: "https://web.example.test" },
    });
    expect(resolveCorsOrigin(request, ["*"])).toBe("https://web.example.test");
    expect(resolveCorsOrigin(request, ["https://other.example.test"])).toBeNull();
  });

  test("rate limits a bounded key", () => {
    const limiter = new RateLimiter(true);
    limiter.consume("actor", 1, 60);
    expect(() => limiter.consume("actor", 1, 60)).toThrow();
  });

  test("emits Retry-After for rate-limit errors", () => {
    const response = errorResponse(
      new HttpError(429, "RATE_LIMITED", "Too many requests", { retryAfterSeconds: 2.2 }),
    );
    expect(response.headers.get("retry-after")).toBe("3");
  });

  test("revalidates tenant state and rebuilds the current role", async () => {
    let tenantStatus = "active";
    const operator = {
      getData: () => ({
        uuid: "10000000-0000-4000-8000-000000000001",
        tenantId: "20000000-0000-4000-8000-000000000001",
        status: "active",
        role: "owner",
        email: "owner@example.test",
        displayName: "Owner",
      }),
    };
    const auth = new AuthService({
      config,
      administrators: { findByUuid: async () => null },
      tenants: { findByUuid: async () => ({ getData: () => ({ status: tenantStatus }) }) },
      operators: { findByUuid: async () => operator },
      users: { findByUuid: async () => null },
    } as unknown as ConstructorParameters<typeof AuthService>[0]);
    const actor = {
      uuid: "10000000-0000-4000-8000-000000000001",
      tenantId: "20000000-0000-4000-8000-000000000001",
      kind: "operator",
      role: "tenant_operator",
      email: "owner@example.test",
      displayName: "Owner",
    } as const;

    expect((await auth.revalidateActor(actor)).role).toBe("tenant_owner");
    tenantStatus = "inactive";
    await expect(auth.revalidateActor(actor)).rejects.toBeInstanceOf(HttpError);
  });

  test("ignores spoofed forwarded headers from an untrusted peer", () => {
    expect(
      resolveClientIp({
        peerAddress: "203.0.113.10",
        forwardedFor: "198.51.100.20",
        trustedProxies: ["127.0.0.1"],
      }),
    ).toBe("203.0.113.10");
  });

  test("walks a valid forwarded chain from the trusted edge", () => {
    expect(
      resolveClientIp({
        peerAddress: "127.0.0.1",
        forwardedFor: "198.51.100.20, 10.0.0.5",
        trustedProxies: ["127.0.0.1", "10.0.0.5"],
      }),
    ).toBe("198.51.100.20");
  });

  test("falls back to the trusted peer when the forwarded chain is malformed", () => {
    expect(
      resolveClientIp({
        peerAddress: "::ffff:127.0.0.1",
        forwardedFor: "spoofed-value",
        trustedProxies: ["127.0.0.1"],
      }),
    ).toBe("127.0.0.1");
  });
});

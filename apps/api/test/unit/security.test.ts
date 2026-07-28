import { describe, expect, test } from "bun:test";
import type { ApiConfig } from "@/config";
import { resolveCorsOrigin } from "@/http/cors";
import { createCsrfToken, verifyCsrfToken } from "@/security/csrf";
import { RateLimiter } from "@/security/rate-limit";

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
});

import { afterEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { ApiClientError, apiRequest, filterForwardHeaders } from "../src";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("API client", () => {
  test("rejects HTML without attempting JSON parsing", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("<html>proxy error</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      apiRequest({
        baseUrl: "http://api.example.test",
        path: "/health/live",
        schema: z.unknown(),
      }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  test("filters hop-by-hop headers", () => {
    const filtered = filterForwardHeaders(
      new Headers({ connection: "keep-alive", "x-correlation-id": "one" }),
    );

    expect(filtered.has("connection")).toBe(false);
    expect(filtered.get("x-correlation-id")).toBe("one");
  });
});

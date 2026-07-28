import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { loadAgentConfig } from "@/config";
import { authenticateServiceRequest } from "@/http/service-auth";

const config = loadAgentConfig({
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017",
  MONGODB_DB: "existing_test_database",
  AGENT_SERVICE_TOKEN: "s".repeat(32),
  DEEPSEEK_API_KEY: "test-provider-key",
});

describe("internal service authentication", () => {
  test("binds signature to timestamp, path and body", () => {
    const timestamp = Date.now().toString();
    const body = new TextEncoder().encode('{"task":"one"}');
    const signature = createHmac("sha256", config.serviceToken)
      .update(`${timestamp}\nPOST\n/internal/runs\n`)
      .update(body)
      .digest("base64url");
    const request = new Request("http://127.0.0.1/internal/runs", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.serviceToken}`,
        "x-service-timestamp": timestamp,
        "x-service-signature": signature,
        "x-tenant-id": "00000000-0000-4000-8000-000000000001",
        "x-actor-id": "00000000-0000-4000-8000-000000000002",
      },
    });

    expect(authenticateServiceRequest(request, body, config).tenantId).toEndWith("0001");
  });
});

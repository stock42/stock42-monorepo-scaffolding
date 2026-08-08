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
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const actorId = "00000000-0000-4000-8000-000000000002";
    const actorRole = "tenant_user";
    const signature = createHmac("sha256", config.serviceToken)
      .update(`${timestamp}\nPOST\n/internal/runs\n${tenantId}\n${actorId}\n${actorRole}\n`)
      .update(body)
      .digest("base64url");
    const request = new Request("http://127.0.0.1/internal/runs", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.serviceToken}`,
        "x-service-timestamp": timestamp,
        "x-service-signature": signature,
        "x-tenant-id": tenantId,
        "x-actor-id": actorId,
        "x-actor-role": actorRole,
      },
    });

    expect(authenticateServiceRequest(request, body, config).tenantId).toEndWith("0001");
  });

  test("binds tenant, actor and role to the service signature", () => {
    const timestamp = Date.now().toString();
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const actorId = "00000000-0000-4000-8000-000000000002";
    const body = new Uint8Array();
    const signature = createHmac("sha256", config.serviceToken)
      .update(`${timestamp}\nGET\n/internal/runs/run\n${tenantId}\n${actorId}\ntenant_user\n`)
      .update(body)
      .digest("base64url");
    const request = new Request("http://127.0.0.1/internal/runs/run", {
      headers: {
        authorization: `Bearer ${config.serviceToken}`,
        "x-service-timestamp": timestamp,
        "x-service-signature": signature,
        "x-tenant-id": tenantId,
        "x-actor-id": actorId,
        "x-actor-role": "tenant_owner",
      },
    });

    expect(() => authenticateServiceRequest(request, body, config)).toThrow(
      "Invalid service signature",
    );
  });
});

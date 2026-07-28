import { describe, expect, test } from "bun:test";
import {
  CreateAgentRunInputSchema,
  CreateTenantInputSchema,
  LoginInputSchema,
  WebSocketClientMessageSchema,
} from "../src";

describe("shared contracts", () => {
  test("requires a tenant slug for tenant actors", () => {
    const result = LoginInputSchema.safeParse({
      actorKind: "user",
      email: "user@example.com",
      password: "correct-horse-battery-staple",
    });

    expect(result.success).toBe(false);
  });

  test("normalizes tenant identity fields", () => {
    const input = CreateTenantInputSchema.parse({
      name: "Acme",
      slug: " ACME-ARGENTINA ",
      owner: {
        email: " OWNER@EXAMPLE.COM ",
        displayName: "Owner",
        password: "correct-horse-battery-staple",
      },
    });

    expect(input.slug).toBe("acme-argentina");
    expect(input.owner.email).toBe("owner@example.com");
  });

  test("rejects short idempotency keys", () => {
    expect(
      CreateAgentRunInputSchema.safeParse({
        task: "Prepare the report",
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
  });

  test("accepts only scoped websocket channels", () => {
    expect(
      WebSocketClientMessageSchema.safeParse({
        type: "subscribe",
        requestId: "one",
        channel: "everything",
      }).success,
    ).toBe(false);
  });
});

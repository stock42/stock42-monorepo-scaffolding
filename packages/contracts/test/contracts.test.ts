import { describe, expect, test } from "bun:test";
import {
  BackofficeAgentRunInputSchema,
  CreateTelegramAiAccessInputSchema,
  CreateAgentRunInputSchema,
  CreateTenantInputSchema,
  LoginInputSchema,
  TelegramAiAccessSchema,
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

  test("requires an explicit tenant for backoffice agent runs", () => {
    expect(
      BackofficeAgentRunInputSchema.safeParse({
        tenantId: crypto.randomUUID(),
        task: "resumir actividad",
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });

  test("accepts numeric Telegram user IDs and rejects aliases", () => {
    const tenantId = crypto.randomUUID();
    expect(
      CreateTelegramAiAccessInputSchema.safeParse({
        tenantId,
        telegramUserId: "123456789",
        label: "Operaciones",
      }).success,
    ).toBe(true);
    expect(
      CreateTelegramAiAccessInputSchema.safeParse({
        tenantId,
        telegramUserId: "@operaciones",
        label: "Operaciones",
      }).success,
    ).toBe(false);
  });

  test("does not allow tenant users as Telegram AI actors", () => {
    expect(
      TelegramAiAccessSchema.safeParse({
        uuid: crypto.randomUUID(),
        telegramUserId: "123456789",
        label: "Operaciones",
        tenantId: crypto.randomUUID(),
        actorId: crypto.randomUUID(),
        actorRole: "tenant_user",
        actorDisplayName: "Usuario",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { BackofficeAgentRunInputSchema } from "@stock42/contracts/agent";
import { CreateTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { CreateEmailCampaignInputSchema } from "@stock42/contracts/email-marketing";
import { CreateTenantInputSchema } from "@stock42/contracts/tenancy";

describe("backoffice contracts", () => {
  test("rejects a tenant without owner credentials", () => {
    expect(
      CreateTenantInputSchema.safeParse({
        name: "Acme",
        slug: "acme",
      }).success,
    ).toBe(false);
  });

  test("requires a tenant on the HTTP agent surface", () => {
    expect(
      BackofficeAgentRunInputSchema.safeParse({
        task: "Estado del tenant",
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  test("validates Telegram AI access creation", () => {
    expect(
      CreateTelegramAiAccessInputSchema.safeParse({
        tenantId: crypto.randomUUID(),
        telegramUserId: "987654321",
        label: "Owner",
      }).success,
    ).toBe(true);
  });

  test("validates tenant-scoped email campaigns", () => {
    expect(
      CreateEmailCampaignInputSchema.safeParse({
        tenantId: crypto.randomUUID(),
        name: "Campaña de agosto",
        templateId: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        scheduledAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });
});

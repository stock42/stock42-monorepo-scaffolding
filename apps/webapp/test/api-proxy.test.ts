import { describe, expect, test } from "bun:test";
import { CreateAgentRunInputSchema } from "@stock42/contracts/agent";

describe("webapp BFF contracts", () => {
  test("requires an explicit idempotency key for agent runs", () => {
    expect(
      CreateAgentRunInputSchema.safeParse({
        task: "Summarize activity",
      }).success,
    ).toBe(false);
  });
});

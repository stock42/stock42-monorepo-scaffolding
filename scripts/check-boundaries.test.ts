import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { inspectSource } from "./check-boundaries";

describe("workspace boundaries", () => {
  test("detecta imports relativos entre aplicaciones", () => {
    const file = resolve(import.meta.dir, "../apps/api/src/example.ts");
    const result = inspectSource(file, 'import { worker } from "../../agent/src/runtime/worker";');

    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain("apps/api -> apps/agent");
  });

  test("permite imports desde packages", () => {
    const file = resolve(import.meta.dir, "../apps/api/src/example.ts");
    expect(inspectSource(file, 'import { ApiError } from "@stock42/contracts";')).toEqual([]);
  });
});

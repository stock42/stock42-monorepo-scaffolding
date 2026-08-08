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

  test("rechaza imports de packages hacia aplicaciones", () => {
    const file = resolve(import.meta.dir, "../packages/contracts/src/example.ts");
    const result = inspectSource(file, 'import { config } from "../../../apps/api/src/config";');

    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain("packages/contracts importa apps/api");
  });

  test("permite al tooling raíz validar contratos de aplicaciones", () => {
    const file = resolve(import.meta.dir, "./root-tool.test.ts");
    expect(inspectSource(file, 'import { loadConfig } from "../apps/api/src/config";')).toEqual([]);
  });

  test("permite imports relativos dentro de la misma aplicación", () => {
    const file = resolve(import.meta.dir, "../apps/api/src/modules/example.ts");
    expect(inspectSource(file, 'import { config } from "../config";')).toEqual([]);
  });
});

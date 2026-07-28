import { readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const sourceExtensions = /\.(?:[cm]?[jt]sx?)$/;
const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;

export type BoundaryViolation = {
  file: string;
  message: string;
};

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.name !== "node_modules" && entry.name !== ".next")
      .map(async (entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? filesBelow(path) : [path];
      }),
  );
  return files.flat();
}

function owningApp(file: string): string | undefined {
  const normalized = relative(root, file).split(sep);
  return normalized[0] === "apps" ? normalized[1] : undefined;
}

export function inspectSource(file: string, source: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const app = owningApp(file);

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;

    if (specifier.includes("/apps/") || specifier.startsWith("apps/")) {
      violations.push({
        file,
        message: `import absoluto hacia una app: ${specifier}`,
      });
    }

    if (app && specifier.startsWith(".")) {
      const target = resolve(file, "..", specifier);
      const targetApp = owningApp(target);
      if (targetApp && targetApp !== app) {
        violations.push({
          file,
          message: `import cruzado apps/${app} -> apps/${targetApp}`,
        });
      }
    }
  }

  return violations;
}

export async function findBoundaryViolations(): Promise<BoundaryViolation[]> {
  const files = (await filesBelow(root)).filter(
    (file) =>
      sourceExtensions.test(file) &&
      !file.includes(`${sep}.agents${sep}`) &&
      !file.endsWith("check-boundaries.test.ts"),
  );
  const violations: BoundaryViolation[] = [];

  for (const file of files) {
    violations.push(...inspectSource(file, await Bun.file(file).text()));
  }

  const appsDirectory = resolve(root, "apps");
  const appEntries = await readdir(appsDirectory, { withFileTypes: true });
  for (const entry of appEntries.filter((candidate) => candidate.isDirectory())) {
    const manifestPath = resolve(appsDirectory, entry.name, "package.json");
    const manifest = await Bun.file(manifestPath).json();
    for (const script of ["build", "start", "dev"]) {
      if (typeof manifest.scripts?.[script] !== "string") {
        violations.push({
          file: manifestPath,
          message: `apps/${entry.name} no declara ${script}`,
        });
      }
    }

    if (
      ["api", "agent"].includes(entry.name) &&
      manifest.scripts.build !== 'bun -e "process.exit(0)"'
    ) {
      violations.push({
        file: manifestPath,
        message: `apps/${entry.name} debe mantener build como no-op`,
      });
    }
  }

  const routes = await filesBelow(appsDirectory);
  for (const route of routes) {
    const normalized = route.split(sep).join("/");
    if (
      normalized.includes("/pages/api/") ||
      normalized.includes("/[...") ||
      normalized.includes("/[[...")
    ) {
      violations.push({
        file: route,
        message: "Route Handler catch-all o Pages API prohibido",
      });
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = await findBoundaryViolations();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${relative(root, violation.file)}: ${violation.message}`);
    }
    process.exit(1);
  }
  console.log("Boundaries válidos.");
}

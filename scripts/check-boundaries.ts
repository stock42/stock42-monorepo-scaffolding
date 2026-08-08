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

type WorkspaceOwner = { kind: "app" | "package"; name: string };

function workspaceOwner(file: string): WorkspaceOwner | undefined {
  const normalized = relative(root, file).split(sep);
  if (normalized[0] === "apps" && normalized[1]) {
    return { kind: "app", name: normalized[1] };
  }
  if (normalized[0] === "packages" && normalized[1]) {
    return { kind: "package", name: normalized[1] };
  }
  return undefined;
}

export function inspectSource(file: string, source: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const owner = workspaceOwner(file);

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;

    const absoluteApp = specifier.startsWith(".")
      ? undefined
      : specifier.match(/(?:^|\/)apps\/([^/]+)/)?.[1];
    if (absoluteApp && owner) {
      violations.push({
        file,
        message:
          owner.kind === "app"
            ? `import cruzado apps/${owner.name} -> apps/${absoluteApp}`
            : `package packages/${owner.name} importa apps/${absoluteApp}`,
      });
    }

    if (owner && specifier.startsWith(".")) {
      const target = resolve(file, "..", specifier);
      const targetOwner = workspaceOwner(target);
      if (targetOwner?.kind === "app" && owner.kind === "package") {
        violations.push({
          file,
          message: `package packages/${owner.name} importa apps/${targetOwner.name}`,
        });
      } else if (
        targetOwner?.kind === "app" &&
        owner.kind === "app" &&
        targetOwner.name !== owner.name
      ) {
        violations.push({
          file,
          message: `import cruzado apps/${owner.name} -> apps/${targetOwner.name}`,
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

    if (entry.name === "agent") {
      const telegramScripts = {
        dev: "TELEGRAM_POLLING_ENABLED=false bun --hot src/entrypoints/all.ts",
        "dev:telegram": "TELEGRAM_POLLING_ENABLED=true bun --hot src/entrypoints/all.ts",
        start: "TELEGRAM_POLLING_ENABLED=true bun run src/entrypoints/all.ts",
      };
      for (const [script, expected] of Object.entries(telegramScripts)) {
        if (manifest.scripts?.[script] !== expected) {
          violations.push({
            file: manifestPath,
            message: `apps/agent debe mantener ${script} con la política de polling Telegram`,
          });
        }
      }
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

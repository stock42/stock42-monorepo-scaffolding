import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { AgentConfig } from "@/config";
import type { AgentStore, ArtifactDocument } from "@/runtime/store/AgentStore";
import { ownerFilter, type ResourceActor } from "@/runtime/authorization";

const mimeExtensions: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/csv": ".csv",
  "text/plain": ".txt",
};

export class ArtifactService {
  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
  ) {}

  async save(input: {
    tenantId: string;
    ownerId: string;
    runId: string | null;
    fileName: string;
    mimeType: keyof typeof mimeExtensions;
    bytes: Uint8Array;
  }): Promise<ArtifactDocument> {
    await mkdir(this.config.storage.artifactPath, { recursive: true });
    const uuid = crypto.randomUUID();
    const extension = mimeExtensions[input.mimeType];
    if (!extension) throw new Error("MIME de artifact no soportado.");
    const storageName = `${uuid}${extension}`;
    const path = this.safePath(storageName);
    await Bun.write(path, input.bytes);
    const artifact: ArtifactDocument = {
      uuid,
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      runId: input.runId,
      fileName: this.safeDisplayName(input.fileName, extension),
      storageName,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      createdAt: new Date().toISOString(),
    };
    await this.store.artifactsCollection.insertOne(artifact);
    if (input.runId) {
      await this.store.appendEvent(input.runId, "artifact.created", {
        artifactId: artifact.uuid,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        size: artifact.size,
      });
    }
    return artifact;
  }

  async list(tenantId: string, runId?: string): Promise<ArtifactDocument[]> {
    return this.store.artifactsCollection
      .find({ tenantId, ...(runId ? { runId } : {}) })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
  }

  async get(
    uuid: string,
    tenantId: string,
    actor: ResourceActor,
  ): Promise<{
    artifact: ArtifactDocument;
    file: ReturnType<typeof Bun.file>;
  } | null> {
    const artifact = await this.store.artifactsCollection.findOne({
      uuid,
      tenantId,
      ...ownerFilter("ownerId", actor),
    });
    if (!artifact) return null;
    return { artifact, file: Bun.file(this.safePath(artifact.storageName)) };
  }

  private safePath(storageName: string): string {
    const path = resolve(this.config.storage.artifactPath, storageName);
    const root = `${resolve(this.config.storage.artifactPath)}${sep}`;
    if (!path.startsWith(root)) throw new Error("Artifact path inválido.");
    return path;
  }

  private safeDisplayName(fileName: string, extension: string): string {
    const base = fileName
      .replace(/[^\p{L}\p{N}._ -]/gu, "_")
      .slice(0, 160)
      .trim();
    if (!base) return `artifact${extension}`;
    return extname(base) ? base : `${base}${extension}`;
  }
}

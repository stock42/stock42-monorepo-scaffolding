import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { UploadIntentInput } from "@stock42/contracts/files";
import type { AgentConfig } from "@/config";
import type { AgentStore, UploadDocument } from "@/runtime/store/AgentStore";
import { ownerFilter, type ResourceActor } from "@/runtime/authorization";

const extensions: Record<UploadIntentInput["mimeType"], string> = {
  "application/pdf": ".pdf",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function matchesSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export class UploadService {
  constructor(
    private readonly config: AgentConfig,
    private readonly store: AgentStore,
  ) {}

  async createIntent(
    input: UploadIntentInput,
    context: { tenantId: string; ownerId: string },
  ): Promise<UploadDocument> {
    if (input.size > this.config.storage.maxUploadBytes) {
      throw new Error("El upload excede el límite configurado.");
    }
    const now = new Date().toISOString();
    const uuid = crypto.randomUUID();
    const upload: UploadDocument = {
      uuid,
      tenantId: context.tenantId,
      ownerId: context.ownerId,
      fileName: input.fileName.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180),
      storageName: `${uuid}${extensions[input.mimeType]}`,
      mimeType: input.mimeType,
      declaredSize: input.size,
      size: 0,
      expectedSha256: input.sha256,
      sha256: null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await this.store.uploadsCollection.insertOne(upload);
    return upload;
  }

  async write(
    uuid: string,
    tenantId: string,
    ownerId: string,
    bytes: Uint8Array,
  ): Promise<UploadDocument> {
    const upload = await this.store.uploadsCollection.findOne({
      uuid,
      tenantId,
      ownerId,
      status: "pending",
    });
    if (!upload) throw new Error("Upload no encontrado o ya consumido.");
    if (
      bytes.byteLength !== upload.declaredSize ||
      bytes.byteLength > this.config.storage.maxUploadBytes
    ) {
      await this.reject(upload.uuid);
      throw new Error("El tamaño real del upload no coincide.");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== upload.expectedSha256 || !matchesSignature(bytes, upload.mimeType)) {
      await this.reject(upload.uuid);
      throw new Error("El contenido del upload no coincide con su declaración.");
    }

    await mkdir(this.config.storage.uploadPath, { recursive: true });
    await Bun.write(this.safePath(upload.storageName), bytes);
    const updated = await this.store.uploadsCollection.findOneAndUpdate(
      { uuid: upload.uuid, status: "pending" },
      {
        $set: {
          status: "ready",
          size: bytes.byteLength,
          sha256,
          updatedAt: new Date().toISOString(),
        },
      },
      { returnDocument: "after" },
    );
    if (!updated) throw new Error("El upload cambió durante la escritura.");
    return updated;
  }

  async get(uuid: string, tenantId: string, actor: ResourceActor): Promise<UploadDocument | null> {
    return this.store.uploadsCollection.findOne({
      uuid,
      tenantId,
      status: "ready",
      ...ownerFilter("ownerId", actor),
    });
  }

  private async reject(uuid: string): Promise<void> {
    await this.store.uploadsCollection.updateOne(
      { uuid, status: "pending" },
      { $set: { status: "rejected", updatedAt: new Date().toISOString() } },
    );
  }

  private safePath(storageName: string): string {
    const path = resolve(this.config.storage.uploadPath, storageName);
    const root = `${resolve(this.config.storage.uploadPath)}${sep}`;
    if (!path.startsWith(root)) throw new Error("Upload path inválido.");
    return path;
  }
}

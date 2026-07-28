import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import type { AgentConfig } from "@/config";
import type { AgentStore } from "@/runtime/store/AgentStore";
import type { ToolDefinition } from "@/runtime/contracts/types";
import { ArtifactService } from "../artifacts/ArtifactService";
import { TelegramService } from "../telegram/TelegramService";
import { UploadService } from "../uploads/UploadService";

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    config: AgentConfig,
    store: AgentStore,
    readonly artifacts = new ArtifactService(config, store),
    readonly uploads = new UploadService(config, store),
    telegram = new TelegramService(config, store),
  ) {
    this.register({
      name: "get_current_time",
      description: "Returns the current ISO timestamp.",
      inputSchema: z.object({}),
      outputSchema: z.object({ timestamp: z.string().datetime() }),
      actionClass: "read",
      allowedRoles: ["platform_admin", "tenant_owner", "tenant_operator", "tenant_user"],
      timeoutMs: 1_000,
      idempotent: true,
      execute: async () => ({ timestamp: new Date().toISOString() }),
    });

    this.register({
      name: "get_tenant_context",
      description: "Returns the authorized tenant and actor context for this run.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        actorRole: z.string(),
      }),
      actionClass: "read",
      allowedRoles: ["tenant_owner", "tenant_operator", "tenant_user"],
      timeoutMs: 1_000,
      idempotent: true,
      execute: async (_input, context) => ({
        tenantId: context.run.tenantId,
        actorId: context.run.actorId,
        actorRole: context.actorRole,
      }),
    });

    this.register({
      name: "generate_csv",
      description: "Creates a bounded CSV artifact from validated headers and rows.",
      inputSchema: z.object({
        fileName: z.string().min(1).max(120),
        headers: z.array(z.string().max(200)).min(1).max(50),
        rows: z.array(z.array(z.string().max(5_000)).max(50)).max(5_000),
      }),
      outputSchema: z.object({
        artifactId: z.string().uuid(),
        fileName: z.string(),
        size: z.number().int().nonnegative(),
      }),
      actionClass: "write",
      allowedRoles: ["tenant_owner", "tenant_operator", "tenant_user"],
      timeoutMs: 10_000,
      idempotent: false,
      execute: async (input, context) => {
        for (const row of input.rows) {
          if (row.length !== input.headers.length) {
            throw new Error("Todas las filas deben coincidir con los headers.");
          }
        }
        const csv = [
          input.headers.map(csvCell).join(","),
          ...input.rows.map((row) => row.map(csvCell).join(",")),
        ].join("\r\n");
        const artifact = await this.artifacts.save({
          tenantId: context.run.tenantId,
          ownerId: context.run.actorId,
          runId: context.run.uuid,
          fileName: input.fileName,
          mimeType: "text/csv",
          bytes: new TextEncoder().encode(csv),
        });
        return {
          artifactId: artifact.uuid,
          fileName: artifact.fileName,
          size: artifact.size,
        };
      },
    });

    this.register({
      name: "generate_pdf",
      description: "Creates a controlled text-only PDF artifact.",
      inputSchema: z.object({
        fileName: z.string().min(1).max(120),
        title: z.string().min(1).max(200),
        paragraphs: z.array(z.string().min(1).max(5_000)).min(1).max(50),
      }),
      outputSchema: z.object({
        artifactId: z.string().uuid(),
        fileName: z.string(),
        size: z.number().int().nonnegative(),
      }),
      actionClass: "write",
      allowedRoles: ["tenant_owner", "tenant_operator", "tenant_user"],
      timeoutMs: 15_000,
      idempotent: false,
      execute: async (input, context) => {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        let page = pdf.addPage([595, 842]);
        let y = 790;
        page.drawText(input.title, {
          x: 48,
          y,
          size: 18,
          font: bold,
          color: rgb(0.08, 0.15, 0.28),
        });
        y -= 36;
        for (const paragraph of input.paragraphs) {
          const lines = paragraph.match(/.{1,82}(?:\s|$)/g) ?? [paragraph];
          for (const line of lines) {
            if (y < 60) {
              page = pdf.addPage([595, 842]);
              y = 790;
            }
            page.drawText(line.trim(), { x: 48, y, size: 10, font, color: rgb(0.15, 0.18, 0.24) });
            y -= 15;
          }
          y -= 8;
        }
        const artifact = await this.artifacts.save({
          tenantId: context.run.tenantId,
          ownerId: context.run.actorId,
          runId: context.run.uuid,
          fileName: input.fileName,
          mimeType: "application/pdf",
          bytes: await pdf.save(),
        });
        return {
          artifactId: artifact.uuid,
          fileName: artifact.fileName,
          size: artifact.size,
        };
      },
    });

    this.register({
      name: "inspect_upload",
      description: "Reads validated metadata for one tenant-scoped upload.",
      inputSchema: z.object({ uploadId: z.string().uuid() }),
      outputSchema: z.object({
        uploadId: z.string().uuid(),
        fileName: z.string(),
        mimeType: z.string(),
        size: z.number().int().nonnegative(),
        sha256: z.string(),
      }),
      actionClass: "read",
      allowedRoles: ["tenant_owner", "tenant_operator", "tenant_user"],
      timeoutMs: 3_000,
      idempotent: true,
      execute: async (input, context) => {
        const upload = await this.uploads.get(input.uploadId, context.run.tenantId);
        if (!upload?.sha256) throw new Error("Upload no encontrado.");
        return {
          uploadId: upload.uuid,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          size: upload.size,
          sha256: upload.sha256,
        };
      },
    });

    this.register({
      name: "list_artifacts",
      description: "Lists up to 100 artifacts for the current run.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        items: z.array(
          z.object({
            artifactId: z.string().uuid(),
            fileName: z.string(),
            mimeType: z.string(),
            size: z.number().int().nonnegative(),
          }),
        ),
      }),
      actionClass: "read",
      allowedRoles: ["tenant_owner", "tenant_operator", "tenant_user"],
      timeoutMs: 3_000,
      idempotent: true,
      execute: async (_input, context) => ({
        items: (await this.artifacts.list(context.run.tenantId, context.run.uuid)).map(
          (artifact) => ({
            artifactId: artifact.uuid,
            fileName: artifact.fileName,
            mimeType: artifact.mimeType,
            size: artifact.size,
          }),
        ),
      }),
    });

    this.register({
      name: "send_telegram_message",
      description: "Sends a Telegram message after explicit human confirmation.",
      inputSchema: z.object({
        chatId: z.string().regex(/^-?\d+$/),
        text: z.string().min(1).max(4_000),
      }),
      outputSchema: z.object({
        deliveryId: z.string().uuid(),
        externalId: z.string(),
      }),
      actionClass: "critical",
      allowedRoles: ["tenant_owner", "tenant_operator"],
      timeoutMs: 35_000,
      idempotent: true,
      execute: async (input, context) =>
        telegram.send({
          tenantId: context.run.tenantId,
          runId: context.run.uuid,
          chatId: input.chatId,
          text: input.text,
        }),
    });
  }

  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool no registrada: ${name}`);
    return tool;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  private register<TInput extends z.ZodType>(tool: ToolDefinition<TInput>): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool duplicada: ${tool.name}`);
    this.tools.set(tool.name, tool as unknown as ToolDefinition);
  }
}

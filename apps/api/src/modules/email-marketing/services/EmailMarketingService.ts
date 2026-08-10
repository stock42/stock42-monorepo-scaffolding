import type {
  EmailCampaign,
  EmailCampaignStatus,
  EmailCampaignSummary,
  EmailSpoolerEntry,
} from "@stock42/contracts/email-marketing";
import nodemailer, { type Transporter } from "nodemailer";
import type { ApiConfig } from "@/config";
import { HttpError } from "@/errors/HttpError";
import { UserStorage } from "@/modules/users/services/UserStorage";
import {
  EmailCampaignStorage,
  EmailSpoolerStorage,
  EmailTemplateStorage,
  UserGroupStorage,
  type EmailCampaignDocument,
  type EmailSpoolerDocument,
} from "./EmailMarketingStorage";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmailTemplate(
  template: string,
  values: { displayName: string; email: string },
  html: boolean,
): string {
  return template.replace(/{{\s*(?:user\.)?(displayName|email)\s*}}/g, (_match, key) => {
    const value = values[key as keyof typeof values] ?? "";
    return html ? escapeHtml(value) : value;
  });
}

export function resolveCampaignTerminalStatus(
  currentStatus: EmailCampaignStatus,
  summary: EmailCampaignSummary,
): EmailCampaignStatus | null {
  if (currentStatus === "stopped" || summary.pending > 0 || summary.processing > 0) return null;
  if (summary.sent > 0) return "completed";
  if (summary.failed > 0) return "failed";
  return "stopped";
}

function publicSpooler(document: EmailSpoolerDocument): EmailSpoolerEntry {
  return {
    uuid: document.uuid,
    tenantId: document.tenantId,
    campaignId: document.campaignId,
    templateId: document.templateId,
    userId: document.userId,
    to: document.to,
    from: document.from,
    subject: document.subject,
    body: document.body,
    status: document.status,
    scheduledAt: document.scheduledAt,
    attempts: document.attempts,
    lastError: document.lastError,
    sentAt: document.sentAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    version: document.version,
  };
}

export class EmailMarketingService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private activeBatch: Promise<void> | null = null;
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ApiConfig["email"]) {
    this.transporter = config.configured
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        })
      : null;
  }

  start(): void {
    if (!this.config.enabled || this.timer) return;
    this.runBatch();
    this.timer = setInterval(() => this.runBatch(), this.config.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.activeBatch;
  }

  async createCampaign(input: {
    tenantId: string;
    name: string;
    templateId: string;
    groupId: string;
    scheduledAt: string;
    idempotencyKey: string;
  }): Promise<EmailCampaign> {
    const existing = await EmailCampaignStorage.findByIdempotencyKey(
      input.tenantId,
      input.idempotencyKey,
    );
    if (existing) return this.toPublicCampaign(existing);
    if (!this.config.from) {
      throw new HttpError(
        409,
        "CONFLICT",
        "MAIL_FROM debe configurarse antes de programar campañas.",
      );
    }

    const [group, template] = await Promise.all([
      UserGroupStorage.findByUuid(input.groupId, input.tenantId),
      EmailTemplateStorage.findByUuid(input.templateId, input.tenantId),
    ]);
    if (!group || group.status !== "active") {
      throw new HttpError(404, "NOT_FOUND", "Grupo activo no encontrado.");
    }
    if (!template || template.status !== "active") {
      throw new HttpError(404, "NOT_FOUND", "Plantilla activa no encontrada.");
    }

    const memberIds = await UserGroupStorage.listMemberIds(input.tenantId, input.groupId, 5_000);
    const users = await UserStorage.findActiveByUuids(input.tenantId, memberIds);
    if (users.length === 0) {
      throw new HttpError(409, "CONFLICT", "El grupo no tiene usuarios activos con email.");
    }

    const now = new Date().toISOString();
    const campaign: EmailCampaignDocument = {
      uuid: crypto.randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      templateId: input.templateId,
      groupId: input.groupId,
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      stoppedAt: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await EmailCampaignStorage.create(campaign);

    try {
      const entries: EmailSpoolerDocument[] = users.map((user) => {
        const values = { displayName: user.toPublic().displayName, email: user.email };
        const subject = renderEmailTemplate(template.subject, values, false)
          .replace(/[\r\n]+/g, " ")
          .trim()
          .slice(0, 200);
        const body = renderEmailTemplate(template.body, values, true);
        if (body.length > 500_000) {
          throw new HttpError(
            400,
            "BAD_REQUEST",
            "La plantilla renderizada supera el máximo de 500.000 caracteres.",
          );
        }
        return {
          uuid: crypto.randomUUID(),
          tenantId: input.tenantId,
          campaignId: campaign.uuid,
          templateId: template.uuid,
          userId: user.uuid,
          to: user.email,
          from: this.config.from!,
          subject,
          body,
          status: "pending",
          scheduledAt: input.scheduledAt,
          attempts: 0,
          lastError: null,
          sentAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          ready: false,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
      });
      await EmailSpoolerStorage.createMany(entries);
      await EmailSpoolerStorage.activateCampaignEntries(campaign.tenantId, campaign.uuid);
      return this.toPublicCampaign(campaign);
    } catch (cause) {
      await EmailSpoolerStorage.deleteCampaignEntries(campaign.tenantId, campaign.uuid);
      await EmailCampaignStorage.setStatus(campaign.uuid, campaign.tenantId, "failed");
      throw cause;
    }
  }

  async stopCampaign(tenantId: string, campaignId: string): Promise<EmailCampaign> {
    const campaign = await EmailCampaignStorage.findByUuid(campaignId, tenantId);
    if (!campaign) throw new HttpError(404, "NOT_FOUND", "Campaña no encontrada.");
    if (campaign.status === "completed") {
      throw new HttpError(409, "CONFLICT", "La campaña ya fue completada.");
    }
    const stoppedAt = new Date().toISOString();
    const updated = await EmailCampaignStorage.setStatus(
      campaignId,
      tenantId,
      "stopped",
      stoppedAt,
    );
    await EmailSpoolerStorage.stopCampaign(tenantId, campaignId);
    return this.toPublicCampaign(updated!);
  }

  async sendNow(tenantId: string, spoolerId: string): Promise<EmailSpoolerEntry> {
    const current = await EmailSpoolerStorage.findByUuid(spoolerId, tenantId);
    if (!current) throw new HttpError(404, "NOT_FOUND", "Email del spooler no encontrado.");
    const campaign = await EmailCampaignStorage.findByUuid(current.campaignId, tenantId);
    if (!campaign || campaign.status === "stopped") {
      throw new HttpError(409, "CONFLICT", "La campaña está detenida.");
    }
    const updated = await EmailSpoolerStorage.scheduleNow(spoolerId, tenantId);
    if (!updated) {
      throw new HttpError(409, "CONFLICT", "El email ya está procesándose o fue enviado.");
    }
    await EmailCampaignStorage.setStatus(campaign.uuid, tenantId, "scheduled");
    if (this.config.enabled) this.runBatch();
    return publicSpooler(updated);
  }

  async stopSpooler(tenantId: string, spoolerId: string): Promise<EmailSpoolerEntry> {
    const updated = await EmailSpoolerStorage.stop(spoolerId, tenantId);
    if (!updated) {
      throw new HttpError(409, "CONFLICT", "El email ya está procesándose o fue enviado.");
    }
    await this.refreshCampaign(updated.campaignId, tenantId);
    return publicSpooler(updated);
  }

  async toPublicCampaign(document: EmailCampaignDocument): Promise<EmailCampaign> {
    return {
      uuid: document.uuid,
      tenantId: document.tenantId,
      name: document.name,
      templateId: document.templateId,
      groupId: document.groupId,
      status: document.status,
      scheduledAt: document.scheduledAt,
      stoppedAt: document.stoppedAt,
      summary: await EmailSpoolerStorage.summary(document.uuid),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      version: document.version,
    };
  }

  toPublicSpooler(document: EmailSpoolerDocument): EmailSpoolerEntry {
    return publicSpooler(document);
  }

  async health(tenantId: string): Promise<{
    enabled: boolean;
    configured: boolean;
    from: string | null;
    pending: number;
    processing: number;
    failed: number;
  }> {
    return {
      enabled: this.config.enabled,
      configured: this.config.configured,
      from: this.config.from ?? null,
      ...(await EmailSpoolerStorage.counts(tenantId)),
    };
  }

  private async processBatch(): Promise<void> {
    if (this.processing || !this.config.enabled || !this.transporter) return;
    this.processing = true;
    try {
      for (let index = 0; index < this.config.batchSize; index += 1) {
        const document = await EmailSpoolerStorage.claimDue(
          new Date().toISOString(),
          this.config.leaseMs,
        );
        if (!document) break;
        await this.process(document);
      }
    } catch (cause) {
      console.error("Email spooler batch failed", {
        error: cause instanceof Error ? cause.message : "Unknown error",
      });
    } finally {
      this.processing = false;
    }
  }

  private runBatch(): void {
    if (this.activeBatch) return;
    this.activeBatch = this.processBatch().finally(() => {
      this.activeBatch = null;
    });
  }

  private async process(document: EmailSpoolerDocument): Promise<void> {
    const campaign = await EmailCampaignStorage.findByUuid(document.campaignId, document.tenantId);
    if (!campaign || !["scheduled", "sending"].includes(campaign.status)) {
      await EmailSpoolerStorage.stopClaimed(document);
      return;
    }
    await EmailCampaignStorage.setStatus(campaign.uuid, campaign.tenantId, "sending");
    try {
      await this.transporter!.sendMail({
        from: document.from,
        to: document.to,
        subject: document.subject,
        html: document.body,
      });
      await EmailSpoolerStorage.markSent(document, new Date().toISOString());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Error SMTP desconocido";
      const retryAt =
        document.attempts < this.config.maxAttempts
          ? new Date(
              Date.now() + Math.min(3_600_000, 60_000 * 2 ** (document.attempts - 1)),
            ).toISOString()
          : null;
      await EmailSpoolerStorage.markFailed(document, message, retryAt);
    }
    await this.refreshCampaign(document.campaignId, document.tenantId);
  }

  private async refreshCampaign(campaignId: string, tenantId: string): Promise<void> {
    const campaign = await EmailCampaignStorage.findByUuid(campaignId, tenantId);
    if (!campaign) return;
    const summary: EmailCampaignSummary = await EmailSpoolerStorage.summary(campaignId);
    const status = resolveCampaignTerminalStatus(campaign.status, summary);
    if (!status) return;
    await EmailCampaignStorage.setStatus(campaignId, tenantId, status);
  }
}

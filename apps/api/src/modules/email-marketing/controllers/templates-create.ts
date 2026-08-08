import { CreateEmailTemplateInputSchema } from "@stock42/contracts/email-marketing";
import { MongoServerError } from "mongodb";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import type { EmailTemplateDocument } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.templates.create",
  version: "1.0.0",
  method: "POST",
  path: "/email-templates/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = CreateEmailTemplateInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    const now = new Date().toISOString();
    const template: EmailTemplateDocument = {
      ...input,
      uuid: crypto.randomUUID(),
      status: "active",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    try {
      await context.storages.emailTemplates.create(template);
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "Ya existe una plantilla con ese nombre.");
      }
      throw cause;
    }
    await context.audit.record(
      actor,
      "email-marketing.template.create",
      { type: "email-template", id: template.uuid },
      { tenantId: input.tenantId },
    );
    return response.status(201).json({ ok: true, data: template });
  },
});

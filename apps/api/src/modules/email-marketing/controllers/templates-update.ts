import { UpdateEmailTemplateInputSchema } from "@stock42/contracts/email-marketing";
import { MongoServerError } from "mongodb";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.templates.update",
  version: "1.0.0",
  method: "PATCH",
  path: "/email-templates/:id/update",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = UpdateEmailTemplateInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    try {
      const updated = await context.storages.emailTemplates.update(
        request.params.id ?? "",
        input.tenantId,
        input,
      );
      if (!updated) {
        throw new HttpError(409, "CONFLICT", "La plantilla cambió; recargá y reintentá.");
      }
      await context.audit.record(
        actor,
        "email-marketing.template.update",
        { type: "email-template", id: updated.uuid },
        { tenantId: input.tenantId, status: input.status },
      );
      return response.json({ ok: true, data: updated });
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "Ya existe una plantilla con ese nombre.");
      }
      throw cause;
    }
  },
});

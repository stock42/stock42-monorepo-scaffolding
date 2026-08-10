import { CreateEmailCampaignInputSchema } from "@stock42/contracts/email-marketing";
import { MongoServerError } from "mongodb";
import { AuditService } from "@/audit/AuditService";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { EmailCampaignStorage } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.campaigns.create",
  version: "1.0.0",
  method: "POST",
  path: "/email-campaigns/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = CreateEmailCampaignInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    try {
      const campaign = await context.emailMarketing.createCampaign(input);
      await AuditService.record(
        actor,
        "email-marketing.campaign.create",
        { type: "email-campaign", id: campaign.uuid },
        {
          tenantId: input.tenantId,
          groupId: input.groupId,
          templateId: input.templateId,
          recipients: campaign.summary.total,
        },
      );
      return response.status(201).json({ ok: true, data: campaign });
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        const existing = await EmailCampaignStorage.findByIdempotencyKey(
          input.tenantId,
          input.idempotencyKey,
        );
        if (existing) {
          return response.json({
            ok: true,
            data: await context.emailMarketing.toPublicCampaign(existing),
          });
        }
        throw new HttpError(409, "CONFLICT", "La campaña ya existe.");
      }
      throw cause;
    }
  },
});

import { EmailCampaignActionInputSchema } from "@stock42/contracts/email-marketing";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.campaign.stop",
  version: "1.0.0",
  method: "POST",
  path: "/email-campaigns/:id/stop",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = EmailCampaignActionInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    const campaign = await context.emailMarketing.stopCampaign(
      input.tenantId,
      request.params.id ?? "",
    );
    await context.audit.record(
      actor,
      "email-marketing.campaign.stop",
      { type: "email-campaign", id: campaign.uuid },
      { tenantId: input.tenantId },
    );
    return response.json({ ok: true, data: campaign });
  },
});

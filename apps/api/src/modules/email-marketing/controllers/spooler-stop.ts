import { EmailSpoolerActionInputSchema } from "@stock42/contracts/email-marketing";
import { AuditService } from "@/audit/AuditService";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.spooler.stop",
  version: "1.0.0",
  method: "POST",
  path: "/email-spooler/:id/stop",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = EmailSpoolerActionInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    const entry = await context.emailMarketing.stopSpooler(input.tenantId, request.params.id ?? "");
    await AuditService.record(
      actor,
      "email-marketing.spooler.stop",
      { type: "email-spooler", id: entry.uuid },
      { tenantId: input.tenantId, campaignId: entry.campaignId },
    );
    return response.json({ ok: true, data: entry });
  },
});

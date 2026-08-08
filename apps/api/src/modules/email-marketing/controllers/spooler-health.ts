import { UuidSchema } from "@stock42/contracts/common";
import { z } from "zod";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

const QuerySchema = z.object({ tenantId: UuidSchema });

export default controller({
  name: "email-marketing.spooler.health",
  version: "1.0.0",
  method: "GET",
  path: "/email-spooler/health",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    const input = QuerySchema.parse(request.query);
    await requireMarketingTenant(actor, input.tenantId);
    return response.json({
      ok: true,
      data: await getAppContext().emailMarketing.health(input.tenantId),
    });
  },
});

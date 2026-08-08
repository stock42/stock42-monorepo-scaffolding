import { PaginationInputSchema, UuidSchema } from "@stock42/contracts/common";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

const QuerySchema = PaginationInputSchema.extend({ tenantId: UuidSchema });

export default controller({
  name: "email-marketing.campaigns.list",
  version: "1.0.0",
  method: "GET",
  path: "/email-campaigns",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    const query = QuerySchema.parse(request.query);
    await requireMarketingTenant(actor, query.tenantId);
    const documents = await context.storages.emailCampaigns.list(
      query.tenantId,
      query.limit,
      query.cursor,
    );
    const items = await Promise.all(
      documents.map((document) => context.emailMarketing.toPublicCampaign(document)),
    );
    return response.json({
      ok: true,
      data: {
        items,
        pagination: {
          limit: query.limit,
          nextCursor: documents.length === query.limit ? (documents.at(-1)?.uuid ?? null) : null,
        },
      },
    });
  },
});

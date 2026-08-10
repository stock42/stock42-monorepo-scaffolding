import { PaginationInputSchema, UuidSchema } from "@stock42/contracts/common";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { EmailTemplateStorage } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

const QuerySchema = PaginationInputSchema.extend({ tenantId: UuidSchema });

export default controller({
  name: "email-marketing.templates.list",
  version: "1.0.0",
  method: "GET",
  path: "/email-templates",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    const query = QuerySchema.parse(request.query);
    await requireMarketingTenant(actor, query.tenantId);
    const items = await EmailTemplateStorage.list(query.tenantId, query.limit, query.cursor);
    return response.json({
      ok: true,
      data: {
        items,
        pagination: {
          limit: query.limit,
          nextCursor: items.length === query.limit ? (items.at(-1)?.uuid ?? null) : null,
        },
      },
    });
  },
});

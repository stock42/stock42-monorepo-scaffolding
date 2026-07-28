import { PaginationInputSchema, UuidSchema } from "@stock42/contracts/common";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { requireTenantManager } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

const QuerySchema = PaginationInputSchema.extend({
  tenantId: UuidSchema,
});

export default controller({
  name: "telegram-ai.access.list",
  version: "1.0.0",
  method: "GET",
  path: "/telegram-ai/access",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    const query = QuerySchema.parse(request.query);
    requireTenantManager(actor, query.tenantId);
    const items = await context.storages.telegramAiAccess.list(
      query.tenantId,
      query.limit,
      query.cursor,
    );
    return response.json({
      ok: true,
      data: {
        items: items.map((item) => item.toPublic()),
        pagination: {
          limit: query.limit,
          nextCursor: items.length === query.limit ? (items.at(-1)?.uuid ?? null) : null,
        },
      },
    });
  },
});

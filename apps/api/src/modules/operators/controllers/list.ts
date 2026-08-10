import { PaginationInputSchema } from "@stock42/contracts/common";
import { controller } from "@/http/controller";
import { OperatorStorage } from "../services/OperatorStorage";
import { requireTenantAccess } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "operators.list",
  version: "1.0.0",
  method: "GET",
  path: "/tenants/:id/operators",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    const tenantId = request.params.id ?? "";
    requireTenantAccess(actor, tenantId);
    const pagination = PaginationInputSchema.parse(request.query);
    const items = await OperatorStorage.list(tenantId, pagination.limit, pagination.cursor);
    return response.json({
      ok: true,
      data: {
        items: items.map((item) => item.toPublic()),
        pagination: {
          limit: pagination.limit,
          nextCursor: items.length === pagination.limit ? (items.at(-1)?.uuid ?? null) : null,
        },
      },
    });
  },
});

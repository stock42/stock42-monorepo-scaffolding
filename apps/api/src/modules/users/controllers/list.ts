import { PaginationInputSchema } from "@stock42/contracts/common";
import { controller } from "@/http/controller";
import { UserStorage } from "../services/UserStorage";
import { requireTenantAccess } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "users.list",
  version: "1.0.0",
  method: "GET",
  path: "/tenants/:id/users",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    const tenantId = request.params.id ?? "";
    requireTenantAccess(actor, tenantId);
    const pagination = PaginationInputSchema.parse(request.query);
    const items = await UserStorage.list(tenantId, pagination.limit, pagination.cursor);
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

import { PaginationInputSchema } from "@stock42/contracts/common";
import { controller } from "@/http/controller";
import { TenantStorage } from "../services/TenantStorage";
import { requirePlatformAdministrator } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "tenants.list",
  version: "1.0.0",
  method: "GET",
  path: "/tenants",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    requirePlatformAdministrator(actor);
    const pagination = PaginationInputSchema.parse(request.query);
    const items = await TenantStorage.list(pagination.limit, pagination.cursor);
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

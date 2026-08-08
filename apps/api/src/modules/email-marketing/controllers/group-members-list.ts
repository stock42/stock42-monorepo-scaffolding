import { PaginationInputSchema, UuidSchema } from "@stock42/contracts/common";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

const QuerySchema = PaginationInputSchema.extend({ tenantId: UuidSchema });

export default controller({
  name: "email-marketing.group-members.list",
  version: "1.0.0",
  method: "GET",
  path: "/user-groups/:id/members",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    const query = QuerySchema.parse(request.query);
    await requireMarketingTenant(actor, query.tenantId);
    const groupId = request.params.id ?? "";
    if (!(await context.storages.userGroups.findByUuid(groupId, query.tenantId))) {
      throw new HttpError(404, "NOT_FOUND", "Grupo no encontrado.");
    }
    const ids = await context.storages.userGroups.listMemberIds(
      query.tenantId,
      groupId,
      query.limit,
      query.cursor,
    );
    const users = await context.storages.users.findActiveByUuids(query.tenantId, ids);
    return response.json({
      ok: true,
      data: {
        items: users.map((user) => user.toPublic()),
        pagination: {
          limit: query.limit,
          nextCursor: ids.length === query.limit ? (ids.at(-1) ?? null) : null,
        },
      },
    });
  },
});

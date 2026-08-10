import { PaginationInputSchema, UuidSchema } from "@stock42/contracts/common";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { UserStorage } from "@/modules/users/services/UserStorage";
import { authenticatedRequest } from "@/security/request";
import { UserGroupStorage } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

const QuerySchema = PaginationInputSchema.extend({ tenantId: UuidSchema });

export default controller({
  name: "email-marketing.group-members.list",
  version: "1.0.0",
  method: "GET",
  path: "/user-groups/:id/members",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    const query = QuerySchema.parse(request.query);
    await requireMarketingTenant(actor, query.tenantId);
    const groupId = request.params.id ?? "";
    if (!(await UserGroupStorage.findByUuid(groupId, query.tenantId))) {
      throw new HttpError(404, "NOT_FOUND", "Grupo no encontrado.");
    }
    const ids = await UserGroupStorage.listMemberIds(
      query.tenantId,
      groupId,
      query.limit,
      query.cursor,
    );
    const users = await UserStorage.findActiveByUuids(query.tenantId, ids);
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

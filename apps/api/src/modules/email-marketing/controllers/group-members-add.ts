import { AddUserGroupMembersInputSchema } from "@stock42/contracts/email-marketing";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.group-members.add",
  version: "1.0.0",
  method: "POST",
  path: "/user-groups/:id/members/add",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = AddUserGroupMembersInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    const groupId = request.params.id ?? "";
    if (!(await context.storages.userGroups.findByUuid(groupId, input.tenantId))) {
      throw new HttpError(404, "NOT_FOUND", "Grupo no encontrado.");
    }
    const uniqueUserIds = [...new Set(input.userIds)];
    const users = await context.storages.users.findActiveByUuids(input.tenantId, uniqueUserIds);
    if (users.length !== uniqueUserIds.length) {
      throw new HttpError(400, "BAD_REQUEST", "Uno o más usuarios no existen o están inactivos.");
    }
    const memberCount = await context.storages.userGroups.addMembers(
      input.tenantId,
      groupId,
      uniqueUserIds,
    );
    await context.audit.record(
      actor,
      "email-marketing.group-members.add",
      { type: "user-group", id: groupId },
      { tenantId: input.tenantId, added: uniqueUserIds.length, memberCount },
    );
    return response.json({ ok: true, data: { memberCount } });
  },
});

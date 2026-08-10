import { RemoveUserGroupMemberInputSchema } from "@stock42/contracts/email-marketing";
import { AuditService } from "@/audit/AuditService";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { UserGroupStorage } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.group-members.remove",
  version: "1.0.0",
  method: "DELETE",
  path: "/user-groups/:id/members/:userId",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = RemoveUserGroupMemberInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    const groupId = request.params.id ?? "";
    const userId = request.params.userId ?? "";
    const memberCount = await UserGroupStorage.removeMember(input.tenantId, groupId, userId);
    await AuditService.record(
      actor,
      "email-marketing.group-members.remove",
      { type: "user-group", id: groupId },
      { tenantId: input.tenantId, userId, memberCount },
    );
    return response.json({ ok: true, data: { memberCount } });
  },
});

import { UpdateUserGroupInputSchema } from "@stock42/contracts/email-marketing";
import { MongoServerError } from "mongodb";
import { AuditService } from "@/audit/AuditService";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { UserGroupStorage } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.groups.update",
  version: "1.0.0",
  method: "PATCH",
  path: "/user-groups/:id/update",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = UpdateUserGroupInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    try {
      const updated = await UserGroupStorage.update(request.params.id ?? "", input.tenantId, input);
      if (!updated) {
        throw new HttpError(409, "CONFLICT", "El grupo cambió; recargá y reintentá.");
      }
      await AuditService.record(
        actor,
        "email-marketing.group.update",
        { type: "user-group", id: updated.uuid },
        { tenantId: input.tenantId, status: input.status },
      );
      return response.json({ ok: true, data: updated });
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "Ya existe un grupo con ese nombre.");
      }
      throw cause;
    }
  },
});

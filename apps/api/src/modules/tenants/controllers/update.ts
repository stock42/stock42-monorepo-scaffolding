import { UpdateStatusInputSchema } from "@stock42/contracts/tenancy";
import { AuditService } from "@/audit/AuditService";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { TenantStorage } from "../services/TenantStorage";
import { requirePlatformAdministrator } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "tenants.update",
  version: "1.0.0",
  method: "PATCH",
  path: "/tenants/:id/update",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request, { csrf: true });
    requirePlatformAdministrator(actor);
    const input = UpdateStatusInputSchema.parse(request.body);
    const tenant = await TenantStorage.updateStatus(
      request.params.id ?? "",
      input.status,
      input.expectedVersion,
    );
    if (!tenant) {
      throw new HttpError(409, "CONFLICT", "El tenant cambió; recargá y reintentá.");
    }
    await AuditService.record(actor, "tenant.status.update", {
      type: "tenant",
      id: tenant.uuid,
    });
    return response.json({ ok: true, data: tenant.toPublic() });
  },
});

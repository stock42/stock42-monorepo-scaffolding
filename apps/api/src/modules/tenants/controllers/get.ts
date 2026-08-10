import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { TenantStorage } from "../services/TenantStorage";
import { requireTenantAccess } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "tenants.get",
  version: "1.0.0",
  method: "GET",
  path: "/tenants/:id",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request);
    const tenantId = request.params.id ?? "";
    requireTenantAccess(actor, tenantId);
    const tenant = await TenantStorage.findByUuid(tenantId);
    if (!tenant) throw new HttpError(404, "NOT_FOUND", "Tenant no encontrado.");
    return response.json({ ok: true, data: tenant.toPublic() });
  },
});

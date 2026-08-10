import { CreateUserInputSchema } from "@stock42/contracts/tenancy";
import { controller } from "@/http/controller";
import { TenancyService } from "@/modules/tenants/services/TenancyService";
import { requireTenantManager } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "users.create",
  version: "1.0.0",
  method: "POST",
  path: "/tenants/:id/users/create",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const tenantId = request.params.id ?? "";
    requireTenantManager(actor, tenantId);
    const created = await TenancyService.createUser(
      tenantId,
      CreateUserInputSchema.parse(request.body),
      actor,
    );
    return response.status(201).json({ ok: true, data: created.toPublic() });
  },
});

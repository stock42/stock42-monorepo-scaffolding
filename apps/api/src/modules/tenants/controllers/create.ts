import { CreateTenantInputSchema } from "@stock42/contracts/tenancy";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { requirePlatformAdministrator } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "tenants.create",
  version: "1.0.0",
  method: "POST",
  path: "/tenants/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    requirePlatformAdministrator(actor);
    const tenant = await context.tenancy.createTenant(
      CreateTenantInputSchema.parse(request.body),
      actor,
    );
    return response.status(201).json({ ok: true, data: tenant.toPublic() });
  },
});

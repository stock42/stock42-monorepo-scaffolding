import { CreateOperatorInputSchema } from "@stock42/contracts/tenancy";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { requireTenantManager } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "operators.create",
  version: "1.0.0",
  method: "POST",
  path: "/tenants/:id/operators/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const tenantId = request.params.id ?? "";
    requireTenantManager(actor, tenantId);
    const created = await context.tenancy.createOperator(
      tenantId,
      CreateOperatorInputSchema.parse(request.body),
      actor,
    );
    return response.status(201).json({ ok: true, data: created.toPublic() });
  },
});

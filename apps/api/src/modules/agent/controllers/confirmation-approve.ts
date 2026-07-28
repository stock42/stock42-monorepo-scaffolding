import { BackofficeAgentScopeSchema } from "@stock42/contracts/agent";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { resolveAgentTenant } from "../tenant-context";

export default controller({
  name: "agent.confirmation.approve",
  version: "1.0.0",
  method: "POST",
  path: "/agent/confirmations/:id/approve",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const scope = BackofficeAgentScopeSchema.safeParse(request.body);
    const tenantId = resolveAgentTenant(actor, scope.success ? scope.data.tenantId : undefined);
    const result = await context.agentClient.resolveConfirmation(
      request.params.id ?? "",
      "approved",
      tenantId,
      actor.uuid,
    );
    return response.json(result);
  },
});

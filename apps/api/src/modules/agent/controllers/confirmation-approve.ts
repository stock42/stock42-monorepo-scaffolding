import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "agent.confirmation.approve",
  version: "1.0.0",
  method: "POST",
  path: "/agent/confirmations/:id/approve",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    if (!actor.tenantId) throw new HttpError(403, "FORBIDDEN", "Tenant requerido.");
    const result = await context.agentClient.resolveConfirmation(
      request.params.id ?? "",
      "approved",
      actor.tenantId,
      actor.uuid,
    );
    return response.json(result);
  },
});

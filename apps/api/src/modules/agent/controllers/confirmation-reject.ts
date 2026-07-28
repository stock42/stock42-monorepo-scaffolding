import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "agent.confirmation.reject",
  version: "1.0.0",
  method: "POST",
  path: "/agent/confirmations/:id/reject",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    if (!actor.tenantId) throw new HttpError(403, "FORBIDDEN", "Tenant requerido.");
    const result = await context.agentClient.resolveConfirmation(
      request.params.id ?? "",
      "rejected",
      actor.tenantId,
      actor.uuid,
    );
    return response.json(result);
  },
});

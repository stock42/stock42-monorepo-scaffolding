import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "agent.run.get",
  version: "1.0.0",
  method: "GET",
  path: "/agent/runs/:id",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    if (!actor.tenantId) throw new HttpError(403, "FORBIDDEN", "Tenant requerido.");
    const result = await context.agentClient.getRun(
      request.params.id ?? "",
      actor.tenantId,
      actor.uuid,
    );
    return response.json(result);
  },
});

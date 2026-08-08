import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { resolveAgentTenant } from "../tenant-context";

export default controller({
  name: "agent.run.get",
  version: "1.0.0",
  method: "GET",
  path: "/agent/runs/:id",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    const tenantId = resolveAgentTenant(actor, request.query.tenantId);
    const result = await context.agentClient.getRun(
      request.params.id ?? "",
      tenantId,
      actor.uuid,
      actor.role,
    );
    return response.json(result);
  },
});

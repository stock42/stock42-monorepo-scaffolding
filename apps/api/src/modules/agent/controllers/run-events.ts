import { z } from "zod";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { resolveAgentTenant } from "../tenant-context";

export default controller({
  name: "agent.run.events",
  version: "1.0.0",
  method: "GET",
  path: "/agent/runs/:id/events",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    const tenantId = resolveAgentTenant(actor, request.query.tenantId);
    const cursor = z.coerce.number().int().nonnegative().default(0).parse(request.query.cursor);
    const result = await context.agentClient.events(
      request.params.id ?? "",
      tenantId,
      actor.uuid,
      actor.role,
      cursor,
    );
    return response.json(result);
  },
});

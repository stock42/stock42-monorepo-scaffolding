import { z } from "zod";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "agent.run.events",
  version: "1.0.0",
  method: "GET",
  path: "/agent/runs/:id/events",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    if (!actor.tenantId) throw new HttpError(403, "FORBIDDEN", "Tenant requerido.");
    const cursor = z.coerce.number().int().nonnegative().default(0).parse(request.query.cursor);
    const result = await context.agentClient.events(
      request.params.id ?? "",
      actor.tenantId,
      actor.uuid,
      cursor,
    );
    return response.json(result);
  },
});

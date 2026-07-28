import { CreateAgentRunInputSchema } from "@stock42/contracts/agent";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "agent.run.create",
  version: "1.0.0",
  method: "POST",
  path: "/agent/runs/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    if (!actor.tenantId) {
      throw new HttpError(403, "FORBIDDEN", "La ejecución requiere un tenant.");
    }
    context.rateLimiter.consume(
      `agent:${actor.tenantId}:${actor.uuid}`,
      context.config.rateLimit.agentRequests,
      context.config.rateLimit.windowSeconds,
    );
    const input = CreateAgentRunInputSchema.parse(request.body);
    const result = await context.agentClient.createRun({
      tenantId: actor.tenantId,
      actorId: actor.uuid,
      actorRole: actor.role,
      request: input,
    });
    return response.status(202).json(result);
  },
});

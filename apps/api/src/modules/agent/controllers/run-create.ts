import { BackofficeAgentRunInputSchema, CreateAgentRunInputSchema } from "@stock42/contracts/agent";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import { authenticatedRequest } from "@/security/request";
import { resolveAgentTenant } from "../tenant-context";

export default controller({
  name: "agent.run.create",
  version: "1.0.0",
  method: "POST",
  path: "/agent/runs/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const scoped = BackofficeAgentRunInputSchema.safeParse(request.body);
    const tenantId = resolveAgentTenant(actor, scoped.success ? scoped.data.tenantId : undefined);
    const input = CreateAgentRunInputSchema.parse(request.body);
    const tenant = await TenantStorage.findByUuid(tenantId);
    if (!tenant || tenant.toPublic().status !== "active") {
      throw new HttpError(404, "NOT_FOUND", "Tenant activo no encontrado.");
    }
    context.rateLimiter.consume(
      `agent:${tenantId}:${actor.uuid}`,
      context.config.rateLimit.agentRequests,
      context.config.rateLimit.windowSeconds,
    );
    const result = await context.agentClient.createRun({
      tenantId,
      actorId: actor.uuid,
      actorRole: actor.role,
      request: input,
    });
    return response.status(202).json(result);
  },
});

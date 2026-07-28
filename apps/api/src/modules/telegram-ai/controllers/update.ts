import { ScopedUpdateTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { requireTenantManager } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "telegram-ai.access.update",
  version: "1.0.0",
  method: "PATCH",
  path: "/telegram-ai/access/:id/update",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = ScopedUpdateTelegramAiAccessInputSchema.parse(request.body);
    requireTenantManager(actor, input.tenantId);
    const updated = await context.storages.telegramAiAccess.update(
      request.params.id ?? "",
      input.tenantId,
      input,
    );
    if (!updated) {
      throw new HttpError(409, "CONFLICT", "El acceso cambió; recargá y reintentá.");
    }
    await context.audit.record(
      actor,
      "telegram-ai.access.update",
      { type: "telegram-ai-access", id: updated.uuid },
      { tenantId: input.tenantId, status: input.status },
    );
    return response.json({ ok: true, data: updated.toPublic() });
  },
});

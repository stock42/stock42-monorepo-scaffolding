import { ScopedDeleteTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { AuditService } from "@/audit/AuditService";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { requireTenantManager } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";
import { TelegramAiAccessStorage } from "../services/TelegramAiAccessStorage";

export default controller({
  name: "telegram-ai.access.delete",
  version: "1.0.0",
  method: "DELETE",
  path: "/telegram-ai/access/:id",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = ScopedDeleteTelegramAiAccessInputSchema.parse(request.body);
    requireTenantManager(actor, input.tenantId);
    const deleted = await TelegramAiAccessStorage.delete(
      request.params.id ?? "",
      input.tenantId,
      input.expectedVersion,
    );
    if (!deleted) {
      throw new HttpError(409, "CONFLICT", "El acceso cambió; recargá y reintentá.");
    }
    await AuditService.record(
      actor,
      "telegram-ai.access.delete",
      { type: "telegram-ai-access", id: request.params.id ?? "" },
      { tenantId: input.tenantId },
    );
    return response.json({ ok: true, data: { deleted: true } });
  },
});

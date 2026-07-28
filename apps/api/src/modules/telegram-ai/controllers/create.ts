import {
  CreateTelegramAiAccessInputSchema,
  TelegramAiActorRoleSchema,
} from "@stock42/contracts/telegram-ai";
import { MongoServerError } from "mongodb";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { requireTenantManager } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";
import { TelegramAiAccessModel } from "../models/TelegramAiAccessModel";

export default controller({
  name: "telegram-ai.access.create",
  version: "1.0.0",
  method: "POST",
  path: "/telegram-ai/access/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = CreateTelegramAiAccessInputSchema.parse(request.body);
    requireTenantManager(actor, input.tenantId);

    const tenant = await context.storages.tenants.findByUuid(input.tenantId);
    if (!tenant || tenant.toPublic().status !== "active") {
      throw new HttpError(404, "NOT_FOUND", "Tenant activo no encontrado.");
    }

    const model = TelegramAiAccessModel.create({
      ...input,
      actorId: actor.uuid,
      actorRole: TelegramAiActorRoleSchema.parse(actor.role),
      actorDisplayName: actor.displayName,
    });
    try {
      const created = await context.storages.telegramAiAccess.create(model);
      await context.audit.record(
        actor,
        "telegram-ai.access.create",
        { type: "telegram-ai-access", id: created.uuid },
        { tenantId: input.tenantId },
      );
      return response.status(201).json({ ok: true, data: created.toPublic() });
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "Ese ID de Telegram ya tiene acceso.");
      }
      throw cause;
    }
  },
});

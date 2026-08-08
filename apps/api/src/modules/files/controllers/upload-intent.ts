import { UploadIntentInputSchema } from "@stock42/contracts/files";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "files.upload.intent",
  version: "1.0.0",
  method: "POST",
  path: "/uploads/intents/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    if (!actor.tenantId) throw new HttpError(403, "FORBIDDEN", "Tenant requerido.");
    const result = await context.agentClient.createUploadIntent(
      UploadIntentInputSchema.parse(request.body),
      actor.tenantId,
      actor.uuid,
      actor.role,
    );
    return response.status(201).json(result);
  },
});

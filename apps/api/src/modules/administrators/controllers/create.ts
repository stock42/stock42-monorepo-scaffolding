import { CreateAdministratorInputSchema } from "@stock42/contracts/tenancy";
import { MongoServerError } from "mongodb";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { AdministratorModel } from "../models/AdministratorModel";
import { requirePlatformAdministrator } from "@/security/authorization";
import { authenticatedRequest } from "@/security/request";

export default controller({
  name: "administrators.create",
  version: "1.0.0",
  method: "POST",
  path: "/administrators/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    requirePlatformAdministrator(actor);
    const input = CreateAdministratorInputSchema.parse(request.body);
    const model = AdministratorModel.create({
      ...input,
      passwordHash: await Bun.password.hash(input.password),
    });
    try {
      const created = await context.storages.administrators.create(model);
      await context.audit.record(actor, "administrator.create", {
        type: "administrator",
        id: created.uuid,
      });
      return response.status(201).json({ ok: true, data: created.toPublic() });
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "El administrador ya existe.");
      }
      throw cause;
    }
  },
});

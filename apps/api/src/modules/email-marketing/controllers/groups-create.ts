import { CreateUserGroupInputSchema } from "@stock42/contracts/email-marketing";
import { MongoServerError } from "mongodb";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import type { UserGroupDocument } from "../services/EmailMarketingStorage";
import { requireMarketingTenant } from "../services/marketing-access";

export default controller({
  name: "email-marketing.groups.create",
  version: "1.0.0",
  method: "POST",
  path: "/user-groups/create",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const input = CreateUserGroupInputSchema.parse(request.body);
    await requireMarketingTenant(actor, input.tenantId);
    const uniqueUserIds = [...new Set(input.userIds)];
    const users = await context.storages.users.findActiveByUuids(input.tenantId, uniqueUserIds);
    if (users.length !== uniqueUserIds.length) {
      throw new HttpError(400, "BAD_REQUEST", "Uno o más usuarios no existen o están inactivos.");
    }
    const now = new Date().toISOString();
    const group: UserGroupDocument = {
      uuid: crypto.randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      status: "active",
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    try {
      await context.storages.userGroups.create(group);
      group.memberCount = await context.storages.userGroups.addMembers(
        input.tenantId,
        group.uuid,
        uniqueUserIds,
      );
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "Ya existe un grupo con ese nombre.");
      }
      throw cause;
    }
    await context.audit.record(
      actor,
      "email-marketing.group.create",
      { type: "user-group", id: group.uuid },
      { tenantId: input.tenantId, memberCount: group.memberCount },
    );
    return response.status(201).json({ ok: true, data: group });
  },
});

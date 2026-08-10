import type { SessionActor } from "@stock42/contracts/auth";
import type {
  CreateOperatorInput,
  CreateTenantInput,
  CreateUserInput,
} from "@stock42/contracts/tenancy";
import { MongoServerError } from "mongodb";
import { AuditService } from "@/audit/AuditService";
import { HttpError } from "@/errors/HttpError";
import { OperatorModel } from "@/modules/operators/models/OperatorModel";
import { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import { UserModel } from "@/modules/users/models/UserModel";
import { UserStorage } from "@/modules/users/services/UserStorage";
import { TenantModel } from "../models/TenantModel";
import { TenantStorage } from "./TenantStorage";

export class TenancyService {
  static async createTenant(input: CreateTenantInput, actor: SessionActor) {
    const existing = await TenantStorage.findBySlug(input.slug);
    if (existing) {
      const owner = await OperatorStorage.findByUuid(
        existing.getData().ownerOperatorId,
        existing.uuid,
      );
      if (owner?.email !== input.owner.email) {
        throw new HttpError(409, "CONFLICT", "El slug ya pertenece a otro tenant.");
      }
      return existing;
    }

    const tenantId = crypto.randomUUID();
    const owner = OperatorModel.create({
      tenantId,
      email: input.owner.email,
      displayName: input.owner.displayName,
      role: "owner",
      passwordHash: await Bun.password.hash(input.owner.password),
    });
    const tenant = TenantModel.create({
      uuid: tenantId,
      name: input.name,
      slug: input.slug,
      ownerOperatorId: owner.uuid,
    });

    await OperatorStorage.create(owner);
    try {
      const created = await TenantStorage.create(tenant);
      await AuditService.record(
        actor,
        "tenant.create",
        { type: "tenant", id: created.uuid },
        {
          ownerOperatorId: owner.uuid,
        },
      );
      return created;
    } catch (cause) {
      await OperatorStorage.removeCreatedOwner(owner.uuid, tenantId);
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "El tenant ya existe.");
      }
      throw cause;
    }
  }

  static async createOperator(tenantId: string, input: CreateOperatorInput, actor: SessionActor) {
    const model = OperatorModel.create({
      tenantId,
      email: input.email,
      displayName: input.displayName,
      role: "operator",
      passwordHash: await Bun.password.hash(input.password),
    });
    try {
      const created = await OperatorStorage.create(model);
      await AuditService.record(
        actor,
        "operator.create",
        { type: "operator", id: created.uuid },
        { tenantId },
      );
      return created;
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "El operador ya existe en el tenant.");
      }
      throw cause;
    }
  }

  static async createUser(tenantId: string, input: CreateUserInput, actor: SessionActor) {
    const model = UserModel.create({
      tenantId,
      email: input.email,
      displayName: input.displayName,
      passwordHash: await Bun.password.hash(input.password),
    });
    try {
      const created = await UserStorage.create(model);
      await AuditService.record(
        actor,
        "user.create",
        { type: "user", id: created.uuid },
        {
          tenantId,
        },
      );
      return created;
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "El usuario ya existe en el tenant.");
      }
      throw cause;
    }
  }
}

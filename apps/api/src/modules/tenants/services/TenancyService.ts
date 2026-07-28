import type { SessionActor } from "@stock42/contracts/auth";
import type {
  CreateOperatorInput,
  CreateTenantInput,
  CreateUserInput,
} from "@stock42/contracts/tenancy";
import { MongoServerError } from "mongodb";
import type { AuditService } from "@/audit/AuditService";
import { HttpError } from "@/errors/HttpError";
import { OperatorModel } from "@/modules/operators/models/OperatorModel";
import type { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import { UserModel } from "@/modules/users/models/UserModel";
import type { UserStorage } from "@/modules/users/services/UserStorage";
import { TenantModel } from "../models/TenantModel";
import type { TenantStorage } from "./TenantStorage";

export class TenancyService {
  constructor(
    private readonly tenants: TenantStorage,
    private readonly operators: OperatorStorage,
    private readonly users: UserStorage,
    private readonly audit: AuditService,
  ) {}

  async createTenant(input: CreateTenantInput, actor: SessionActor) {
    const existing = await this.tenants.findBySlug(input.slug);
    if (existing) {
      const owner = await this.operators.findByUuid(
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

    await this.operators.create(owner);
    try {
      const created = await this.tenants.create(tenant);
      await this.audit.record(
        actor,
        "tenant.create",
        { type: "tenant", id: created.uuid },
        {
          ownerOperatorId: owner.uuid,
        },
      );
      return created;
    } catch (cause) {
      await this.operators.removeCreatedOwner(owner.uuid, tenantId);
      if (cause instanceof MongoServerError && cause.code === 11_000) {
        throw new HttpError(409, "CONFLICT", "El tenant ya existe.");
      }
      throw cause;
    }
  }

  async createOperator(tenantId: string, input: CreateOperatorInput, actor: SessionActor) {
    const model = OperatorModel.create({
      tenantId,
      email: input.email,
      displayName: input.displayName,
      role: "operator",
      passwordHash: await Bun.password.hash(input.password),
    });
    try {
      const created = await this.operators.create(model);
      await this.audit.record(
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

  async createUser(tenantId: string, input: CreateUserInput, actor: SessionActor) {
    const model = UserModel.create({
      tenantId,
      email: input.email,
      displayName: input.displayName,
      passwordHash: await Bun.password.hash(input.password),
    });
    try {
      const created = await this.users.create(model);
      await this.audit.record(
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

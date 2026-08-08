import type { LoginInput, SessionActor } from "@stock42/contracts/auth";
import type { ApiConfig } from "@/config";
import { HttpError } from "@/errors/HttpError";
import type { AdministratorModel } from "@/modules/administrators/models/AdministratorModel";
import type { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";
import type { OperatorModel } from "@/modules/operators/models/OperatorModel";
import type { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import type { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import type { UserModel } from "@/modules/users/models/UserModel";
import type { UserStorage } from "@/modules/users/services/UserStorage";
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from "@/security/cookies";
import { signToken, verifyToken, type TokenClaims } from "@/security/token";

type AuthServiceDependencies = {
  config: ApiConfig;
  administrators: AdministratorStorage;
  tenants: TenantStorage;
  operators: OperatorStorage;
  users: UserStorage;
};

export class AuthService {
  constructor(private readonly dependencies: AuthServiceDependencies) {}

  async login(input: LoginInput): Promise<SessionActor> {
    if (input.actorKind === "administrator") {
      const administrator = await this.dependencies.administrators.findByEmail(input.email);
      return this.administratorActor(await this.verifyIdentity(administrator, input.password));
    }

    const tenant = await this.dependencies.tenants.findBySlug(input.tenantSlug ?? "");
    if (!tenant || tenant.getData().status !== "active") {
      throw new HttpError(401, "UNAUTHENTICATED", "Credenciales inválidas.");
    }

    if (input.actorKind === "operator") {
      const operator = await this.dependencies.operators.findByEmail(tenant.uuid, input.email);
      return this.operatorActor(await this.verifyIdentity(operator, input.password));
    }

    const user = await this.dependencies.users.findByEmail(tenant.uuid, input.email);
    return this.userActor(await this.verifyIdentity(user, input.password));
  }

  async issueTokens(actor: SessionActor, sid = crypto.randomUUID()) {
    const [access, refresh] = await Promise.all([
      signToken(
        {
          type: "access",
          sid,
          actor,
          ttlSeconds: this.dependencies.config.auth.accessTtlSeconds,
        },
        this.dependencies.config.auth.accessSecret,
      ),
      signToken(
        {
          type: "refresh",
          sid,
          actor,
          ttlSeconds: this.dependencies.config.auth.refreshTtlSeconds,
        },
        this.dependencies.config.auth.refreshSecret,
      ),
    ]);
    return { access, refresh, sid };
  }

  async authenticate(headers: Headers): Promise<TokenClaims> {
    const token = parseCookies(headers.get("cookie")).get(ACCESS_COOKIE);
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Sesión requerida.");
    return verifyToken(token, "access", this.dependencies.config.auth.accessSecret);
  }

  async authenticateActive(headers: Headers): Promise<TokenClaims> {
    const claims = await this.authenticate(headers);
    return { ...claims, actor: await this.revalidateActor(claims.actor) };
  }

  async authenticateRefresh(headers: Headers): Promise<TokenClaims> {
    const token = parseCookies(headers.get("cookie")).get(REFRESH_COOKIE);
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Refresh requerido.");
    const claims = await verifyToken(token, "refresh", this.dependencies.config.auth.refreshSecret);
    return { ...claims, actor: await this.revalidateActor(claims.actor) };
  }

  async currentCsrfContext(headers: Headers): Promise<string | null> {
    try {
      return (await this.authenticateRefresh(headers)).sid;
    } catch {
      try {
        return (await this.authenticateActive(headers)).sid;
      } catch {
        return null;
      }
    }
  }

  async revalidateActor(actor: SessionActor): Promise<SessionActor> {
    if (actor.kind === "administrator") {
      const administrator = await this.dependencies.administrators.findByUuid(actor.uuid);
      if (administrator?.getData().status === "active") {
        return this.administratorActor(administrator);
      }
      throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
    }

    if (!actor.tenantId) {
      throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
    }
    const tenant = await this.dependencies.tenants.findByUuid(actor.tenantId);
    if (tenant?.getData().status !== "active") {
      throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
    }
    if (actor.kind === "operator") {
      const operator = await this.dependencies.operators.findByUuid(actor.uuid, actor.tenantId);
      if (operator?.getData().status === "active") return this.operatorActor(operator);
    } else {
      const user = await this.dependencies.users.findByUuid(actor.uuid, actor.tenantId);
      if (user?.getData().status === "active") return this.userActor(user);
    }
    throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
  }

  private async verifyIdentity<TIdentity extends AdministratorModel | OperatorModel | UserModel>(
    identity: TIdentity | null,
    password: string,
  ): Promise<TIdentity> {
    if (!identity || identity.getData().status !== "active") {
      await Bun.password.hash(password);
      throw new HttpError(401, "UNAUTHENTICATED", "Credenciales inválidas.");
    }
    if (!(await Bun.password.verify(password, identity.passwordHash))) {
      throw new HttpError(401, "UNAUTHENTICATED", "Credenciales inválidas.");
    }
    return identity;
  }

  private administratorActor(identity: AdministratorModel): SessionActor {
    const document = identity.getData();
    return {
      uuid: document.uuid,
      kind: "administrator",
      role: "platform_admin",
      tenantId: null,
      email: document.email,
      displayName: document.displayName,
    };
  }

  private operatorActor(identity: OperatorModel): SessionActor {
    const document = identity.getData();
    return {
      uuid: document.uuid,
      kind: "operator",
      role: document.role === "owner" ? "tenant_owner" : "tenant_operator",
      tenantId: document.tenantId,
      email: document.email,
      displayName: document.displayName,
    };
  }

  private userActor(identity: UserModel): SessionActor {
    const document = identity.getData();
    return {
      uuid: document.uuid,
      kind: "user",
      role: "tenant_user",
      tenantId: document.tenantId,
      email: document.email,
      displayName: document.displayName,
    };
  }
}

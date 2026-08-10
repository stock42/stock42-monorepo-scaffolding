import type { LoginInput, SessionActor } from "@stock42/contracts/auth";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import type { AdministratorModel } from "@/modules/administrators/models/AdministratorModel";
import { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";
import type { OperatorModel } from "@/modules/operators/models/OperatorModel";
import { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import type { UserModel } from "@/modules/users/models/UserModel";
import { UserStorage } from "@/modules/users/services/UserStorage";
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from "@/security/cookies";
import { signToken, verifyToken, type TokenClaims } from "@/security/token";

export class AuthService {
  static async login(input: LoginInput): Promise<SessionActor> {
    if (input.actorKind === "administrator") {
      const administrator = await AdministratorStorage.findByEmail(input.email);
      return this.administratorActor(await this.verifyIdentity(administrator, input.password));
    }

    const tenant = await TenantStorage.findBySlug(input.tenantSlug ?? "");
    if (!tenant || tenant.getData().status !== "active") {
      throw new HttpError(401, "UNAUTHENTICATED", "Credenciales inválidas.");
    }

    if (input.actorKind === "operator") {
      const operator = await OperatorStorage.findByEmail(tenant.uuid, input.email);
      return this.operatorActor(await this.verifyIdentity(operator, input.password));
    }

    const user = await UserStorage.findByEmail(tenant.uuid, input.email);
    return this.userActor(await this.verifyIdentity(user, input.password));
  }

  static async issueTokens(actor: SessionActor, sid = crypto.randomUUID()) {
    const config = getAppContext().config;
    const [access, refresh] = await Promise.all([
      signToken(
        {
          type: "access",
          sid,
          actor,
          ttlSeconds: config.auth.accessTtlSeconds,
        },
        config.auth.accessSecret,
      ),
      signToken(
        {
          type: "refresh",
          sid,
          actor,
          ttlSeconds: config.auth.refreshTtlSeconds,
        },
        config.auth.refreshSecret,
      ),
    ]);
    return { access, refresh, sid };
  }

  static async authenticate(headers: Headers): Promise<TokenClaims> {
    const config = getAppContext().config;
    const token = parseCookies(headers.get("cookie")).get(ACCESS_COOKIE);
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Sesión requerida.");
    return verifyToken(token, "access", config.auth.accessSecret);
  }

  static async authenticateActive(headers: Headers): Promise<TokenClaims> {
    const claims = await this.authenticate(headers);
    return { ...claims, actor: await this.revalidateActor(claims.actor) };
  }

  static async authenticateRefresh(headers: Headers): Promise<TokenClaims> {
    const config = getAppContext().config;
    const token = parseCookies(headers.get("cookie")).get(REFRESH_COOKIE);
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Refresh requerido.");
    const claims = await verifyToken(token, "refresh", config.auth.refreshSecret);
    return { ...claims, actor: await this.revalidateActor(claims.actor) };
  }

  static async currentCsrfContext(headers: Headers): Promise<string | null> {
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

  static async revalidateActor(actor: SessionActor): Promise<SessionActor> {
    if (actor.kind === "administrator") {
      const administrator = await AdministratorStorage.findByUuid(actor.uuid);
      if (administrator?.getData().status === "active") {
        return this.administratorActor(administrator);
      }
      throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
    }

    if (!actor.tenantId) {
      throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
    }
    const tenant = await TenantStorage.findByUuid(actor.tenantId);
    if (tenant?.getData().status !== "active") {
      throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
    }
    if (actor.kind === "operator") {
      const operator = await OperatorStorage.findByUuid(actor.uuid, actor.tenantId);
      if (operator?.getData().status === "active") return this.operatorActor(operator);
    } else {
      const user = await UserStorage.findByUuid(actor.uuid, actor.tenantId);
      if (user?.getData().status === "active") return this.userActor(user);
    }
    throw new HttpError(401, "UNAUTHENTICATED", "La identidad está inactiva.");
  }

  private static async verifyIdentity<
    TIdentity extends AdministratorModel | OperatorModel | UserModel,
  >(identity: TIdentity | null, password: string): Promise<TIdentity> {
    if (!identity || identity.getData().status !== "active") {
      await Bun.password.hash(password);
      throw new HttpError(401, "UNAUTHENTICATED", "Credenciales inválidas.");
    }
    if (!(await Bun.password.verify(password, identity.passwordHash))) {
      throw new HttpError(401, "UNAUTHENTICATED", "Credenciales inválidas.");
    }
    return identity;
  }

  private static administratorActor(identity: AdministratorModel): SessionActor {
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

  private static operatorActor(identity: OperatorModel): SessionActor {
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

  private static userActor(identity: UserModel): SessionActor {
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

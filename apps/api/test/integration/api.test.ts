import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AuthResponseSchema, CsrfResponseSchema } from "@stock42/contracts/auth";
import {
  EmailCampaignListResponseSchema,
  EmailCampaignResponseSchema,
  EmailDeliveryHealthResponseSchema,
  EmailSpoolerListResponseSchema,
  EmailTemplateResponseSchema,
  UserGroupResponseSchema,
} from "@stock42/contracts/email-marketing";
import {
  TelegramAiAccessListResponseSchema,
  TelegramAiAccessResponseSchema,
} from "@stock42/contracts/telegram-ai";
import {
  OperatorListResponseSchema,
  OperatorResponseSchema,
  TenantListResponseSchema,
  TenantResponseSchema,
  UserListResponseSchema,
  UserResponseSchema,
} from "@stock42/contracts/tenancy";
import {
  STOCK42_REALTIME_SUBPROTOCOL,
  WebSocketServerMessageSchema,
  WebSocketTicketResponseSchema,
} from "@stock42/contracts/websocket";
import type { RunningApi } from "@/index";
import { getAppContext } from "@/context";

const enabled = Bun.env.API_TEST_ENABLED === "true";
const testRunId = `api-test-${crypto.randomUUID()}`;
const administratorEmail = `${testRunId}@example.test`;
const administratorPassword = `S42-${crypto.randomUUID()}-secure`;
const ownerPassword = `S42-${crypto.randomUUID()}-owner`;
const userPassword = `S42-${crypto.randomUUID()}-user`;
let running: RunningApi | undefined;

class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(headers: Headers): void {
    const setCookies = headers.getSetCookie();
    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(";", 1);
      const separator = pair?.indexOf("=") ?? -1;
      if (!pair || separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (/max-age=0/i.test(setCookie)) this.values.delete(name);
      else this.values.set(name, value);
    }
  }

  header(): string {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function jsonBody(response: Response): Promise<unknown> {
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json();
}

async function csrf(baseUrl: URL, jar: CookieJar): Promise<string> {
  const response = await fetch(new URL("/auth/csrf", baseUrl), {
    method: "POST",
    headers: { cookie: jar.header() },
  });
  jar.absorb(response.headers);
  return CsrfResponseSchema.parse(await jsonBody(response)).data.csrfToken;
}

async function mutate(
  baseUrl: URL,
  jar: CookieJar,
  path: string,
  body?: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method,
    headers: {
      cookie: jar.header(),
      "content-type": "application/json",
      "x-csrf-token": await csrf(baseUrl, jar),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function markFixtures(tenantId: string, ids: string[]): Promise<void> {
  const db = getAppContext().mongo.getDB();
  await Promise.all([
    db.collection("tenants").updateOne({ uuid: tenantId }, { $set: { testRunId } }),
    db.collection("operators").updateMany({ tenantId }, { $set: { testRunId } }),
    db.collection("users").updateMany({ tenantId }, { $set: { testRunId } }),
    db.collection("audit_events").updateMany({ targetId: { $in: ids } }, { $set: { testRunId } }),
  ]);
}

async function markEmailFixtures(tenantId: string): Promise<void> {
  const db = getAppContext().mongo.getDB();
  await Promise.all(
    [
      "user_groups",
      "user_group_members",
      "email_templates",
      "email_campaigns",
      "email_spooler",
    ].map((collection) =>
      db.collection(collection).updateMany({ tenantId }, { $set: { testRunId } }),
    ),
  );
}

async function receiveFirstWebSocketMessage(url: URL): Promise<{
  socket: WebSocket;
  data: unknown;
}> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, STOCK42_REALTIME_SUBPROTOCOL);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timeout esperando el primer mensaje WebSocket."));
    }, 2_000);

    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        try {
          resolve({ socket, data: JSON.parse(String(event.data)) });
        } catch (cause) {
          socket.close();
          reject(cause);
        }
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Falló la conexión WebSocket."));
      },
      { once: true },
    );
  });
}

describe.skipIf(!enabled)("API HTTP against configured MongoDB", () => {
  beforeAll(async () => {
    if (!Bun.env.MONGODB_URI || !Bun.env.MONGODB_DB || !Bun.env.TEST_TENANT_ID) {
      throw new Error("Los tests requieren MONGODB_URI, MONGODB_DB y TEST_TENANT_ID exactos.");
    }
    Bun.env.EMAIL_SPOOLER_ENABLED = "false";
    Bun.env.MAIL_FROM = `${testRunId}@example.test`;
    const { startApi } = await import("@/index");
    running = await startApi();
    await getAppContext()
      .mongo.getDB()
      .collection("administrators")
      .insertOne({
        uuid: crypto.randomUUID(),
        email: administratorEmail,
        displayName: "API Test Administrator",
        passwordHash: await Bun.password.hash(administratorPassword),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        testRunId,
      });
  });

  afterAll(async () => {
    if (!running) return;
    if (!testRunId.startsWith("api-test-")) {
      throw new Error("Cleanup bloqueado: testRunId inválido.");
    }
    const db = getAppContext().mongo.getDB();
    for (const collection of [
      "administrators",
      "tenants",
      "operators",
      "users",
      "agent_telegram_access",
      "user_groups",
      "user_group_members",
      "email_templates",
      "email_campaigns",
      "email_spooler",
      "audit_events",
    ]) {
      await db.collection(collection).deleteMany({ testRunId });
    }
    await db.collection("websocket_tickets").deleteMany({ testRunId });
    await running.close();
  });

  test("covers health, auth, tenancy, email marketing, Telegram AI, isolation and WS", async () => {
    const baseUrl = running?.server.url;
    if (!baseUrl) throw new Error("API no iniciada.");

    const live = await fetch(new URL("/health/live", baseUrl));
    const ready = await fetch(new URL("/health/ready", baseUrl));
    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);

    const cors = await fetch(new URL("/health/live", baseUrl), {
      headers: { origin: "https://client.example.test" },
    });
    expect(cors.headers.get("access-control-allow-origin")).toBe("https://client.example.test");
    expect(cors.headers.get("access-control-allow-credentials")).toBe("true");

    const adminJar = new CookieJar();
    const loginResponse = await fetch(new URL("/auth/login", baseUrl), {
      method: "POST",
      headers: {
        cookie: adminJar.header(),
        "content-type": "application/json",
        "x-csrf-token": await csrf(baseUrl, adminJar),
      },
      body: JSON.stringify({
        actorKind: "administrator",
        email: administratorEmail,
        password: administratorPassword,
      }),
    });
    adminJar.absorb(loginResponse.headers);
    const login = AuthResponseSchema.parse(await jsonBody(loginResponse));
    expect(login.data.actor.role).toBe("platform_admin");

    const suffix = crypto.randomUUID().slice(0, 8);
    const ownerEmail = `${testRunId}-owner@example.test`;
    const tenantResponse = await mutate(baseUrl, adminJar, "/tenants/create", {
      name: `API Test ${suffix}`,
      slug: `api-test-${suffix}`,
      owner: {
        email: ownerEmail,
        displayName: "Test Owner",
        password: ownerPassword,
      },
    });
    expect(tenantResponse.status).toBe(201);
    const tenant = TenantResponseSchema.parse(await jsonBody(tenantResponse)).data;
    await markFixtures(tenant.uuid, [tenant.uuid, tenant.ownerOperatorId]);

    const operatorResponse = await mutate(
      baseUrl,
      adminJar,
      `/tenants/${tenant.uuid}/operators/create`,
      {
        email: `${testRunId}-operator@example.test`,
        displayName: "Test Operator",
        password: ownerPassword,
      },
    );
    expect(operatorResponse.status).toBe(201);
    const operator = OperatorResponseSchema.parse(await jsonBody(operatorResponse)).data;

    const userEmail = `${testRunId}-user@example.test`;
    const userResponse = await mutate(baseUrl, adminJar, `/tenants/${tenant.uuid}/users/create`, {
      email: userEmail,
      displayName: "Test User",
      password: userPassword,
    });
    expect(userResponse.status).toBe(201);
    const user = UserResponseSchema.parse(await jsonBody(userResponse)).data;
    await markFixtures(tenant.uuid, [
      tenant.uuid,
      tenant.ownerOperatorId,
      operator.uuid,
      user.uuid,
    ]);

    const tenants = TenantListResponseSchema.parse(
      await jsonBody(
        await fetch(new URL("/tenants?limit=100", baseUrl), {
          headers: { cookie: adminJar.header() },
        }),
      ),
    );
    expect(tenants.data.items.some((item) => item.uuid === tenant.uuid)).toBe(true);

    const operators = OperatorListResponseSchema.parse(
      await jsonBody(
        await fetch(new URL(`/tenants/${tenant.uuid}/operators?limit=100`, baseUrl), {
          headers: { cookie: adminJar.header() },
        }),
      ),
    );
    expect(operators.data.items.some((item) => item.uuid === operator.uuid)).toBe(true);

    const users = UserListResponseSchema.parse(
      await jsonBody(
        await fetch(new URL(`/tenants/${tenant.uuid}/users?limit=100`, baseUrl), {
          headers: { cookie: adminJar.header() },
        }),
      ),
    );
    expect(users.data.items.some((item) => item.uuid === user.uuid)).toBe(true);

    const groupResponse = await mutate(baseUrl, adminJar, "/user-groups/create", {
      tenantId: tenant.uuid,
      name: `API Test Audience ${suffix}`,
      description: "Audience created by the integration suite",
      userIds: [user.uuid],
    });
    expect(groupResponse.status).toBe(201);
    const group = UserGroupResponseSchema.parse(await jsonBody(groupResponse)).data;
    expect(group.memberCount).toBe(1);

    const templateResponse = await mutate(baseUrl, adminJar, "/email-templates/create", {
      tenantId: tenant.uuid,
      name: `API Test Template ${suffix}`,
      subject: "Hola {{displayName}}",
      body: "<p>Mensaje para {{user.email}}</p>",
    });
    expect(templateResponse.status).toBe(201);
    const template = EmailTemplateResponseSchema.parse(await jsonBody(templateResponse)).data;

    const campaignResponse = await mutate(baseUrl, adminJar, "/email-campaigns/create", {
      tenantId: tenant.uuid,
      name: `API Test Campaign ${suffix}`,
      templateId: template.uuid,
      groupId: group.uuid,
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });
    expect(campaignResponse.status).toBe(201);
    const campaign = EmailCampaignResponseSchema.parse(await jsonBody(campaignResponse)).data;
    expect(campaign.summary).toMatchObject({ pending: 1, total: 1 });

    const campaigns = EmailCampaignListResponseSchema.parse(
      await jsonBody(
        await fetch(new URL(`/email-campaigns?tenantId=${tenant.uuid}&limit=100`, baseUrl), {
          headers: { cookie: adminJar.header() },
        }),
      ),
    );
    expect(campaigns.data.items.some((item) => item.uuid === campaign.uuid)).toBe(true);

    const spooler = EmailSpoolerListResponseSchema.parse(
      await jsonBody(
        await fetch(
          new URL(
            `/email-spooler?tenantId=${tenant.uuid}&campaignId=${campaign.uuid}&limit=100`,
            baseUrl,
          ),
          { headers: { cookie: adminJar.header() } },
        ),
      ),
    );
    expect(spooler.data.items).toHaveLength(1);
    expect(spooler.data.items[0]).toMatchObject({ to: user.email, status: "pending" });

    const emailHealth = EmailDeliveryHealthResponseSchema.parse(
      await jsonBody(
        await fetch(new URL(`/email-spooler/health?tenantId=${tenant.uuid}`, baseUrl), {
          headers: { cookie: adminJar.header() },
        }),
      ),
    );
    expect(emailHealth.data).toMatchObject({ enabled: false, configured: false, pending: 1 });

    const stoppedCampaign = EmailCampaignResponseSchema.parse(
      await jsonBody(
        await mutate(baseUrl, adminJar, `/email-campaigns/${campaign.uuid}/stop`, {
          tenantId: tenant.uuid,
        }),
      ),
    ).data;
    expect(stoppedCampaign.status).toBe("stopped");
    expect(stoppedCampaign.summary.stopped).toBe(1);
    await markEmailFixtures(tenant.uuid);
    await markFixtures(tenant.uuid, [group.uuid, template.uuid, campaign.uuid]);

    const updatedResponse = await mutate(
      baseUrl,
      adminJar,
      `/tenants/${tenant.uuid}/update`,
      { status: "inactive", expectedVersion: 1 },
      "PATCH",
    );
    expect(TenantResponseSchema.parse(await jsonBody(updatedResponse)).data.version).toBe(2);
    await mutate(
      baseUrl,
      adminJar,
      `/tenants/${tenant.uuid}/update`,
      { status: "active", expectedVersion: 2 },
      "PATCH",
    );

    const telegramAccessResponse = await mutate(baseUrl, adminJar, "/telegram-ai/access/create", {
      tenantId: tenant.uuid,
      telegramUserId: `${Date.now()}${Math.floor(Math.random() * 100_000)
        .toString()
        .padStart(5, "0")}`,
      label: "API Test Telegram",
    });
    expect(telegramAccessResponse.status).toBe(201);
    const telegramAccess = TelegramAiAccessResponseSchema.parse(
      await jsonBody(telegramAccessResponse),
    ).data;
    await getAppContext()
      .mongo.getDB()
      .collection("agent_telegram_access")
      .updateOne({ uuid: telegramAccess.uuid }, { $set: { testRunId } });
    const telegramList = TelegramAiAccessListResponseSchema.parse(
      await jsonBody(
        await fetch(new URL(`/telegram-ai/access?tenantId=${tenant.uuid}&limit=100`, baseUrl), {
          headers: { cookie: adminJar.header() },
        }),
      ),
    );
    expect(telegramList.data.items.some((item) => item.uuid === telegramAccess.uuid)).toBe(true);
    const telegramUpdated = await mutate(
      baseUrl,
      adminJar,
      `/telegram-ai/access/${telegramAccess.uuid}/update`,
      {
        tenantId: tenant.uuid,
        label: "API Test Telegram actualizado",
        status: "inactive",
        expectedVersion: telegramAccess.version,
      },
      "PATCH",
    );
    const updatedTelegramAccess = TelegramAiAccessResponseSchema.parse(
      await jsonBody(telegramUpdated),
    ).data;
    expect(updatedTelegramAccess.status).toBe("inactive");
    const telegramDeleted = await mutate(
      baseUrl,
      adminJar,
      `/telegram-ai/access/${telegramAccess.uuid}`,
      {
        tenantId: tenant.uuid,
        expectedVersion: updatedTelegramAccess.version,
      },
      "DELETE",
    );
    expect(telegramDeleted.status).toBe(200);
    await markFixtures(tenant.uuid, [telegramAccess.uuid]);

    const userJar = new CookieJar();
    const userLoginResponse = await fetch(new URL("/auth/login", baseUrl), {
      method: "POST",
      headers: {
        cookie: userJar.header(),
        "content-type": "application/json",
        "x-csrf-token": await csrf(baseUrl, userJar),
      },
      body: JSON.stringify({
        actorKind: "user",
        tenantSlug: tenant.slug,
        email: userEmail,
        password: userPassword,
      }),
    });
    userJar.absorb(userLoginResponse.headers);
    expect(AuthResponseSchema.parse(await jsonBody(userLoginResponse)).data.actor.uuid).toBe(
      user.uuid,
    );
    const forbidden = await fetch(new URL(`/tenants/${crypto.randomUUID()}`, baseUrl), {
      headers: { cookie: userJar.header() },
    });
    expect(forbidden.status).toBe(403);

    const ticketResponse = await mutate(baseUrl, adminJar, "/auth/ws-tickets/create");
    const ticketPayload = WebSocketTicketResponseSchema.parse(await jsonBody(ticketResponse));
    const ticket = ticketPayload.data.ticket;
    await getAppContext()
      .mongo.getDB()
      .collection("websocket_tickets")
      .updateOne({ "actor.email": administratorEmail }, { $set: { testRunId } });
    const websocketUrl = new URL(`/ws?ticket=${encodeURIComponent(ticket)}`, baseUrl);
    websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
    const websocket = await receiveFirstWebSocketMessage(websocketUrl);
    expect(WebSocketServerMessageSchema.parse(websocket.data)).toMatchObject({
      type: "ready",
      protocol: STOCK42_REALTIME_SUBPROTOCOL,
    });
    websocket.socket.close();
    await expect(getAppContext().tickets.consume(ticket)).rejects.toThrow();

    const refreshResponse = await mutate(baseUrl, adminJar, "/auth/refresh");
    adminJar.absorb(refreshResponse.headers);
    expect(AuthResponseSchema.parse(await jsonBody(refreshResponse)).data.actor.uuid).toBe(
      login.data.actor.uuid,
    );
    const logoutResponse = await mutate(baseUrl, adminJar, "/auth/logout");
    adminJar.absorb(logoutResponse.headers);
    expect(logoutResponse.status).toBe(200);
    expect(
      (
        await fetch(new URL("/auth/me", baseUrl), {
          headers: { cookie: adminJar.header() },
        })
      ).status,
    ).toBe(401);
  });
});

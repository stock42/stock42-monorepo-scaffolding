import { Dependencies, MongoClient } from "s42-core";
import { AuditService } from "@/audit/AuditService";
import type { ApiConfig } from "@/config";
import type { AppContext } from "@/context";
import { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";
import { AgentClient } from "@/modules/agent/services/AgentClient";
import { AuthService } from "@/modules/auth/services/AuthService";
import { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import { TenancyService } from "@/modules/tenants/services/TenancyService";
import { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import {
  TELEGRAM_AI_ACCESS_COLLECTION,
  TelegramAiAccessStorage,
} from "@/modules/telegram-ai/services/TelegramAiAccessStorage";
import { UserStorage } from "@/modules/users/services/UserStorage";
import { RateLimiter } from "@/security/rate-limit";
import { WebSocketGateway } from "@/websocket/WebSocketGateway";
import { WebSocketTicketService } from "@/websocket/WebSocketTicketService";
import { runMigrations } from "./migrations";
import { runTestSeeds } from "./test-seeds";

async function step<T>(name: string, task: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await task();
    console.info("Boot step complete", {
      step: name,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (cause) {
    console.error("Boot step failed", {
      step: name,
      durationMs: Math.round(performance.now() - startedAt),
      error: cause,
    });
    throw cause;
  }
}

export async function runBoot(config: ApiConfig): Promise<AppContext> {
  const mongo = MongoClient.getInstance({
    connectionString: config.mongo.uri,
    database: config.mongo.database,
  });
  await step("mongodb.connect", () => mongo.connect());
  await step("mongodb.ping", () =>
    mongo
      .getDB()
      .command({ ping: 1 })
      .then(() => undefined),
  );

  const administrators = new AdministratorStorage(mongo.getCollection("administrators"));
  const tenants = new TenantStorage(mongo.getCollection("tenants"));
  const operators = new OperatorStorage(mongo.getCollection("operators"));
  const users = new UserStorage(mongo.getCollection("users"));
  const telegramAiAccess = new TelegramAiAccessStorage(
    mongo.getCollection(TELEGRAM_AI_ACCESS_COLLECTION),
  );
  const audit = new AuditService(mongo.getCollection("audit_events"));
  const tickets = new WebSocketTicketService(mongo.getCollection("websocket_tickets"), config);
  const agentClient = new AgentClient(config.agent);
  const rateLimiter = new RateLimiter(config.rateLimit.enabled);
  const auth = new AuthService({ config, administrators, tenants, operators, users });
  const tenancy = new TenancyService(tenants, operators, users, audit);
  const websocket = new WebSocketGateway(tickets, agentClient, config);

  const context: AppContext = {
    config,
    mongo,
    storages: { administrators, tenants, operators, users, telegramAiAccess },
    auth,
    tenancy,
    audit,
    agentClient,
    tickets,
    websocket,
    rateLimiter,
    ready: false,
  };

  Dependencies.remove("app");
  Dependencies.add("app", context);

  await step("migrations", () => runMigrations(context));
  await step("module-indexes", async () => {
    await administrators.ensureIndexes();
    await tenants.ensureIndexes();
    await operators.ensureIndexes();
    await users.ensureIndexes();
    await telegramAiAccess.ensureIndexes();
    await audit.ensureIndexes();
    await tickets.ensureIndexes();
  });
  await step("test-seeds", () => runTestSeeds(context));
  context.ready = true;
  return context;
}

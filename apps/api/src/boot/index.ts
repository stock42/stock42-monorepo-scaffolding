import { Dependencies, MongoClient } from "s42-core";
import type { ApiConfig } from "@/config";
import type { AppContext } from "@/context";
import { AgentClient } from "@/modules/agent/services/AgentClient";
import { AuthService } from "@/modules/auth/services/AuthService";
import { EmailMarketingService } from "@/modules/email-marketing/services/EmailMarketingService";
import { RateLimiter } from "@/security/rate-limit";
import { WebSocketGateway } from "@/websocket/WebSocketGateway";
import { WebSocketTicketService } from "@/websocket/WebSocketTicketService";
import { ensureDefaultAdministrator } from "./default-administrator";
import { ensureRequiredIndexes } from "./indexes";
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
  Dependencies.add<MongoClient>("db", mongo);

  const agentClient = new AgentClient(config.agent);
  const rateLimiter = new RateLimiter(config.rateLimit.enabled);
  const websocket = new WebSocketGateway(WebSocketTicketService, agentClient, AuthService, config);
  const emailMarketing = new EmailMarketingService(config.email);

  const context: AppContext = {
    config,
    mongo,
    agentClient,
    websocket,
    emailMarketing,
    rateLimiter,
    ready: false,
  };

  Dependencies.remove("app");
  Dependencies.add("app", context);

  await step("indexes", ensureRequiredIndexes);
  await step("migrations", () => runMigrations(context));
  const defaultAdministrator = config.defaultAdministrator;
  if (defaultAdministrator) {
    await step("default-administrator", () => ensureDefaultAdministrator(defaultAdministrator));
  }
  await step("test-seeds", () => runTestSeeds(context));
  context.ready = true;
  return context;
}

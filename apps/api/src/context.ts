import { Dependencies, type MongoClient } from "s42-core";
import type { ApiConfig } from "@/config";
import type { AgentClient } from "@/modules/agent/services/AgentClient";
import type { EmailMarketingService } from "@/modules/email-marketing/services/EmailMarketingService";
import type { RateLimiter } from "@/security/rate-limit";
import type { WebSocketGateway } from "@/websocket/WebSocketGateway";

export type AppContext = {
  config: ApiConfig;
  mongo: MongoClient;
  agentClient: AgentClient;
  websocket: WebSocketGateway;
  emailMarketing: EmailMarketingService;
  rateLimiter: RateLimiter;
  ready: boolean;
};

export function getAppContext(): AppContext {
  const context = Dependencies.get<AppContext>("app");
  if (!context) throw new Error("AppContext no inicializado.");
  return context;
}

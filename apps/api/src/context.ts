import { Dependencies, type MongoClient } from "s42-core";
import type { AuditService } from "@/audit/AuditService";
import type { ApiConfig } from "@/config";
import type { AdministratorStorage } from "@/modules/administrators/services/AdministratorStorage";
import type { AgentClient } from "@/modules/agent/services/AgentClient";
import type { AuthService } from "@/modules/auth/services/AuthService";
import type { EmailMarketingService } from "@/modules/email-marketing/services/EmailMarketingService";
import type {
  EmailCampaignStorage,
  EmailSpoolerStorage,
  EmailTemplateStorage,
  UserGroupStorage,
} from "@/modules/email-marketing/services/EmailMarketingStorage";
import type { OperatorStorage } from "@/modules/operators/services/OperatorStorage";
import type { TenancyService } from "@/modules/tenants/services/TenancyService";
import type { TenantStorage } from "@/modules/tenants/services/TenantStorage";
import type { TelegramAiAccessStorage } from "@/modules/telegram-ai/services/TelegramAiAccessStorage";
import type { UserStorage } from "@/modules/users/services/UserStorage";
import type { RateLimiter } from "@/security/rate-limit";
import type { WebSocketGateway } from "@/websocket/WebSocketGateway";
import type { WebSocketTicketService } from "@/websocket/WebSocketTicketService";

export type AppContext = {
  config: ApiConfig;
  mongo: MongoClient;
  storages: {
    administrators: AdministratorStorage;
    tenants: TenantStorage;
    operators: OperatorStorage;
    users: UserStorage;
    telegramAiAccess: TelegramAiAccessStorage;
    userGroups: UserGroupStorage;
    emailTemplates: EmailTemplateStorage;
    emailCampaigns: EmailCampaignStorage;
    emailSpooler: EmailSpoolerStorage;
  };
  auth: AuthService;
  tenancy: TenancyService;
  audit: AuditService;
  agentClient: AgentClient;
  tickets: WebSocketTicketService;
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

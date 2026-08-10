import type { SessionActor } from "@stock42/contracts/auth";
import type { CoreRequest } from "@/http/types";
import { getAppContext } from "@/context";
import { AuthService } from "@/modules/auth/services/AuthService";
import { requireCsrf } from "./csrf";

export async function authenticatedRequest(
  request: CoreRequest,
  options: { csrf?: boolean } = {},
): Promise<{ actor: SessionActor; sid: string }> {
  const context = getAppContext();
  const claims = await AuthService.authenticateActive(request.headers);
  if (options.csrf) requireCsrf(request, claims.sid, context.config);
  return { actor: claims.actor, sid: claims.sid };
}

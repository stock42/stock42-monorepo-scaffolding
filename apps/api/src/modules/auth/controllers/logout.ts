import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { AuthService } from "../services/AuthService";
import { clearSessionCookieHeaders } from "@/security/cookies";
import { requireCsrf } from "@/security/csrf";

export default controller({
  name: "auth.logout",
  version: "1.0.0",
  method: "POST",
  path: "/auth/logout",
  async handler(request) {
    const context = getAppContext();
    const contextId = await AuthService.currentCsrfContext(request.headers);
    if (!contextId) throw new HttpError(401, "UNAUTHENTICATED", "Sesión requerida.");
    requireCsrf(request, contextId, context.config);
    return new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), {
      status: 200,
      headers: clearSessionCookieHeaders(context.config),
    });
  },
});

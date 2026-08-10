import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { AuthService } from "../services/AuthService";
import { CSRF_CONTEXT_COOKIE, csrfContextCookie, parseCookies } from "@/security/cookies";
import { createCsrfToken } from "@/security/csrf";

export default controller({
  name: "auth.csrf",
  version: "1.0.0",
  method: "POST",
  path: "/auth/csrf",
  async handler(request) {
    const context = getAppContext();
    const sessionContext = await AuthService.currentCsrfContext(request.headers);
    const cookies = parseCookies(request.headers.get("cookie"));
    const anonymousContext = cookies.get(CSRF_CONTEXT_COOKIE);
    const contextId = sessionContext ?? anonymousContext ?? crypto.randomUUID();
    const headers = new Headers({ "content-type": "application/json" });
    if (!sessionContext && !anonymousContext) {
      headers.append("set-cookie", csrfContextCookie(contextId, context.config));
    }
    return new Response(
      JSON.stringify({
        ok: true,
        data: { csrfToken: createCsrfToken(contextId, context.config) },
      }),
      { status: 200, headers },
    );
  },
});

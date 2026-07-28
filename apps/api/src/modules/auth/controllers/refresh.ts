import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { sessionCookieHeaders } from "@/security/cookies";
import { createCsrfToken, requireCsrf } from "@/security/csrf";

export default controller({
  name: "auth.refresh",
  version: "1.0.0",
  method: "POST",
  path: "/auth/refresh",
  async handler(request) {
    const context = getAppContext();
    const claims = await context.auth.authenticateRefresh(request.headers);
    requireCsrf(request, claims.sid, context.config);
    const tokens = await context.auth.issueTokens(claims.actor);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          actor: claims.actor,
          csrfToken: createCsrfToken(tokens.sid, context.config),
        },
      }),
      { status: 200, headers: sessionCookieHeaders(tokens, context.config) },
    );
  },
});

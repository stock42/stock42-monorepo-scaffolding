import { LoginInputSchema } from "@stock42/contracts/auth";
import { getAppContext } from "@/context";
import { HttpError } from "@/errors/HttpError";
import { controller } from "@/http/controller";
import { CSRF_CONTEXT_COOKIE, parseCookies, sessionCookieHeaders } from "@/security/cookies";
import { createCsrfToken, requireCsrf } from "@/security/csrf";

export default controller({
  name: "auth.login",
  version: "1.0.0",
  method: "POST",
  path: "/auth/login",
  async handler(request) {
    const context = getAppContext();
    context.rateLimiter.consume(
      `login:${request.realIp}`,
      context.config.rateLimit.loginRequests,
      context.config.rateLimit.windowSeconds,
    );
    const anonymousContext = parseCookies(request.headers.get("cookie")).get(CSRF_CONTEXT_COOKIE);
    if (!anonymousContext) {
      throw new HttpError(403, "FORBIDDEN", "Primero se debe obtener un token CSRF.");
    }
    requireCsrf(request, anonymousContext, context.config);

    const actor = await context.auth.login(LoginInputSchema.parse(request.body));
    const tokens = await context.auth.issueTokens(actor);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          actor,
          csrfToken: createCsrfToken(tokens.sid, context.config),
        },
      }),
      {
        status: 200,
        headers: sessionCookieHeaders(tokens, context.config),
      },
    );
  },
});

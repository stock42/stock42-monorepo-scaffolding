import { fileURLToPath } from "node:url";
import { Dependencies, Modules, RouteControllers, type WebSocketData } from "s42-core";
import { runBoot } from "@/boot";
import { loadConfig } from "@/config";
import { errorResponse } from "@/errors/handler";
import { corsPreflight, resolveCorsOrigin, withCors } from "@/http/cors";
import { fileGateway } from "@/modules/files/gateway";
import { resolveClientIp } from "@/security/client-ip";
import { stopSharedListener } from "@/websocket/stop-listener";

export type RunningApi = {
  server: Bun.Server<WebSocketData>;
  close: () => Promise<void>;
};

export async function startApi(): Promise<RunningApi> {
  const config = loadConfig();
  const context = await runBoot(config);

  const modulesDirectory = fileURLToPath(new URL("./modules/", import.meta.url));
  const modules = new Modules(modulesDirectory);
  await modules.load();
  const routeControllers = new RouteControllers(modules.getControllers());
  const routeCallback = routeControllers.getCallback(modules.getHooks());
  const sweepTimer = setInterval(() => context.rateLimiter.sweep(), 60_000);

  const server = Bun.serve<WebSocketData>({
    hostname: config.host,
    port: config.port,
    idleTimeout: 30,
    maxRequestBodySize: 12 * 1024 * 1024,
    development: config.environment !== "production",
    websocket: context.websocket.controllers.getHandler(),
    async fetch(request, bunServer) {
      const url = new URL(request.url);
      const upgrade = await context.websocket.controllers.tryUpgrade(request, bunServer);
      if (upgrade.matched) {
        return upgrade.response;
      }

      const preflight = corsPreflight(request, config.corsOrigins);
      if (preflight) return preflight;
      if (request.headers.has("origin") && !resolveCorsOrigin(request, config.corsOrigins)) {
        return Response.json(
          {
            ok: false,
            error: {
              code: "FORBIDDEN",
              message: "Origin no permitido.",
              errorId: crypto.randomUUID(),
            },
          },
          { status: 403 },
        );
      }

      try {
        const clientIp = resolveClientIp({
          peerAddress: bunServer.requestIP(request)?.address,
          forwardedFor: request.headers.get("x-forwarded-for"),
          trustedProxies: config.trustedProxies,
        });
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-forwarded-for", clientIp);
        const normalizedRequest = new Request(request, { headers: requestHeaders });
        const quota = context.rateLimiter.consume(
          `http:${clientIp}`,
          config.rateLimit.requests,
          config.rateLimit.windowSeconds,
        );
        const fileResponse = await fileGateway(normalizedRequest);
        if (fileResponse) {
          applyRateLimitHeaders(fileResponse.headers, quota);
          return withCors(normalizedRequest, fileResponse, config.corsOrigins);
        }
        const response =
          (await routeCallback(normalizedRequest)) ?? new Response("Not Found", { status: 404 });
        applyRateLimitHeaders(response.headers, quota);
        return withCors(normalizedRequest, response, config.corsOrigins);
      } catch (cause) {
        return withCors(
          request,
          errorResponse(cause, { method: request.method, path: url.pathname }),
          config.corsOrigins,
        );
      }
    },
    error(cause) {
      return errorResponse(cause, { surface: "bun-server" });
    },
  });

  context.websocket.start(server);
  console.info("Stock42 API ready", {
    url: server.url.toString(),
    websocket: config.websocket.publicUrl,
  });

  let closing: Promise<void> | null = null;
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(sweepTimer);
      context.ready = false;
      const listenerStop = stopSharedListener(
        server,
        context.websocket.controllers.getActiveConnections(),
      );
      context.websocket.stop();
      await listenerStop;
      await context.mongo.close();
      Dependencies.clear();
      console.info("Stock42 API stopped");
    })();
    return closing;
  };

  return { server, close };
}

function applyRateLimitHeaders(
  headers: Headers,
  quota: { limit: number; remaining: number; resetAt: number },
): void {
  headers.set("RateLimit-Limit", String(quota.limit));
  headers.set("RateLimit-Remaining", String(quota.remaining));
  headers.set(
    "RateLimit-Reset",
    String(Math.max(1, Math.ceil((quota.resetAt - Date.now()) / 1_000))),
  );
}

if (import.meta.main) {
  const running = await startApi();
  const shutdown = async () => {
    await running.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

import { fileURLToPath } from "node:url";
import { Dependencies, Modules, RouteControllers } from "s42-core";
import { runBoot } from "@/boot";
import { loadConfig } from "@/config";
import { errorResponse } from "@/errors/handler";
import { corsPreflight, resolveCorsOrigin, withCors } from "@/http/cors";
import { fileGateway } from "@/modules/files/gateway";
import type { SocketData } from "@/websocket/WebSocketGateway";

export type RunningApi = {
  server: Bun.Server<SocketData>;
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

  const server = Bun.serve<SocketData>({
    hostname: config.host,
    port: config.port,
    idleTimeout: 30,
    maxRequestBodySize: 12 * 1024 * 1024,
    development: config.environment !== "production",
    websocket: context.websocket.handler,
    async fetch(request, bunServer) {
      const url = new URL(request.url);
      if (url.pathname === "/ws") {
        return context.websocket.upgrade(request, bunServer);
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
        context.rateLimiter.consume(
          `http:${request.headers.get("x-forwarded-for") ?? bunServer.requestIP(request)?.address ?? "unknown"}`,
          config.rateLimit.requests,
          config.rateLimit.windowSeconds,
        );
        const fileResponse = await fileGateway(request);
        if (fileResponse) {
          return withCors(request, fileResponse, config.corsOrigins);
        }
        const response =
          (await routeCallback(request)) ?? new Response("Not Found", { status: 404 });
        return withCors(request, response, config.corsOrigins);
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

  context.websocket.start();
  console.info("Stock42 API ready", {
    url: server.url.toString(),
    websocket: `ws://${config.host}:${server.port}/ws`,
  });

  let closing: Promise<void> | null = null;
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(sweepTimer);
      context.ready = false;
      context.websocket.stop();
      await server.stop(true);
      await context.mongo.close();
      Dependencies.clear();
      console.info("Stock42 API stopped");
    })();
    return closing;
  };

  return { server, close };
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

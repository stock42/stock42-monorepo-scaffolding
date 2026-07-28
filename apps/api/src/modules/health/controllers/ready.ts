import { getAppContext } from "@/context";
import { controller } from "@/http/controller";

export default controller({
  name: "health.ready",
  version: "1.0.0",
  method: "GET",
  path: "/health/ready",
  async handler(_request, response) {
    const context = getAppContext();
    if (!context.ready) {
      return response.status(503).json({
        ok: false,
        error: {
          code: "NOT_READY",
          message: "La API todavía no está lista.",
          errorId: crypto.randomUUID(),
        },
      });
    }
    await context.mongo.getDB().command({ ping: 1 });
    return response.json({
      ok: true,
      data: {
        status: "ready",
        mongodb: "ready",
        agent: "configured",
        timestamp: new Date().toISOString(),
      },
    });
  },
});

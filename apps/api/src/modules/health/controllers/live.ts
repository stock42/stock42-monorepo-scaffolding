import { controller } from "@/http/controller";

export default controller({
  name: "health.live",
  version: "1.0.0",
  method: "GET",
  path: "/health/live",
  handler: (_request, response) =>
    response.json({
      ok: true,
      data: { status: "live", timestamp: new Date().toISOString() },
    }),
});

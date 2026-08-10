import { controller } from "@/http/controller";
import { AuthService } from "../services/AuthService";

export default controller({
  name: "auth.me",
  version: "1.0.0",
  method: "GET",
  path: "/auth/me",
  async handler(request, response) {
    const claims = await AuthService.authenticateActive(request.headers);
    return response.json({ ok: true, data: { actor: claims.actor } });
  },
});

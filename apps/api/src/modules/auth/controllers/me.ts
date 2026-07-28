import { getAppContext } from "@/context";
import { controller } from "@/http/controller";

export default controller({
  name: "auth.me",
  version: "1.0.0",
  method: "GET",
  path: "/auth/me",
  async handler(request, response) {
    const claims = await getAppContext().auth.authenticate(request.headers);
    return response.json({ ok: true, data: { actor: claims.actor } });
  },
});

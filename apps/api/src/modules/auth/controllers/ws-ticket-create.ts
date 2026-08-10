import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { WebSocketTicketService } from "@/websocket/WebSocketTicketService";

export default controller({
  name: "auth.ws-ticket.create",
  version: "1.0.0",
  method: "POST",
  path: "/auth/ws-tickets/create",
  async handler(request, response) {
    const { actor } = await authenticatedRequest(request, { csrf: true });
    const ticket = await WebSocketTicketService.create(actor);
    return response.json({ ok: true, data: ticket });
  },
});

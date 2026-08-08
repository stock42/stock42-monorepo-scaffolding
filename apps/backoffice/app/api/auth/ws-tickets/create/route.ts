import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/auth/ws-tickets/create", { method: "POST" });
}

import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  return proxyApi(request, `/user-groups${new URL(request.url).search}`, { method: "GET" });
}

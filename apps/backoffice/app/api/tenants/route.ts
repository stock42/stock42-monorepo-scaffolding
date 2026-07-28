import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyApi(request, `/tenants${query}`, { method: "GET" });
}

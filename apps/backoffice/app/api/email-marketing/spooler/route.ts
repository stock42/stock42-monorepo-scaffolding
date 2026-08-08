import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  return proxyApi(request, `/email-spooler${new URL(request.url).search}`, { method: "GET" });
}

import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  return proxyApi(request, `/email-spooler/health${new URL(request.url).search}`, {
    method: "GET",
  });
}

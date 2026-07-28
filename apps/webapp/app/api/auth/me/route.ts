import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  return proxyApi(request, "/auth/me", { method: "GET" });
}

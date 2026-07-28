import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).search;
  return proxyApi(request, `/tenants/${encodeURIComponent(id)}/users${query}`, {
    method: "GET",
  });
}

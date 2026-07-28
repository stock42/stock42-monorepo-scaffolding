import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const tenantId = search.get("tenantId") ?? "";
  const cursor = search.get("cursor") ?? "0";
  return proxyApi(
    request,
    `/agent/runs/${encodeURIComponent(id)}/events?tenantId=${encodeURIComponent(tenantId)}&cursor=${encodeURIComponent(cursor)}`,
    { method: "GET" },
  );
}

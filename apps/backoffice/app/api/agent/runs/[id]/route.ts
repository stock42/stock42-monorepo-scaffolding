import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId") ?? "";
  return proxyApi(
    request,
    `/agent/runs/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "GET" },
  );
}

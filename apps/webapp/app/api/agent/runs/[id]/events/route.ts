import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? "0";
  return proxyApi(
    request,
    `/agent/runs/${encodeURIComponent(id)}/events?cursor=${encodeURIComponent(cursor)}`,
    { method: "GET" },
  );
}

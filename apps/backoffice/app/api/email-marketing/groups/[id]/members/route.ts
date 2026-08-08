import { proxyApi } from "@/lib/api-proxy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(
    request,
    `/user-groups/${encodeURIComponent(id)}/members${new URL(request.url).search}`,
    { method: "GET" },
  );
}

import { BackofficeAgentScopeSchema } from "@stock42/contracts/agent";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/agent/confirmations/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    bodySchema: BackofficeAgentScopeSchema,
  });
}

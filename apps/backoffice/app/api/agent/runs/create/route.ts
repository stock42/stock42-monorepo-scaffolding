import { BackofficeAgentRunInputSchema } from "@stock42/contracts/agent";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/agent/runs/create", {
    method: "POST",
    bodySchema: BackofficeAgentRunInputSchema,
  });
}

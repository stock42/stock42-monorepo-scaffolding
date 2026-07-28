import { CreateOperatorInputSchema } from "@stock42/contracts/tenancy";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/tenants/${encodeURIComponent(id)}/operators/create`, {
    method: "POST",
    bodySchema: CreateOperatorInputSchema,
  });
}

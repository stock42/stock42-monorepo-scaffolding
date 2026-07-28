import { CreateUserInputSchema } from "@stock42/contracts/tenancy";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/tenants/${encodeURIComponent(id)}/users/create`, {
    method: "POST",
    bodySchema: CreateUserInputSchema,
  });
}

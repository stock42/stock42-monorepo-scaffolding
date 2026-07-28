import { UpdateStatusInputSchema } from "@stock42/contracts/tenancy";
import { proxyApi } from "@/lib/api-proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/tenants/${encodeURIComponent(id)}/update`, {
    method: "PATCH",
    bodySchema: UpdateStatusInputSchema,
  });
}

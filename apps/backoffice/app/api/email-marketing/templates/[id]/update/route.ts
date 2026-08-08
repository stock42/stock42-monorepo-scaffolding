import { UpdateEmailTemplateInputSchema } from "@stock42/contracts/email-marketing";
import { proxyApi } from "@/lib/api-proxy";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(request, `/email-templates/${encodeURIComponent(id)}/update`, {
    method: "PATCH",
    bodySchema: UpdateEmailTemplateInputSchema,
  });
}

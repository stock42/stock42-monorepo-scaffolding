import { EmailSpoolerActionInputSchema } from "@stock42/contracts/email-marketing";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(request, `/email-spooler/${encodeURIComponent(id)}/stop`, {
    method: "POST",
    bodySchema: EmailSpoolerActionInputSchema,
  });
}

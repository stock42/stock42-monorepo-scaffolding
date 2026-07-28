import { ScopedUpdateTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { proxyApi } from "@/lib/api-proxy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/telegram-ai/access/${encodeURIComponent(id)}/update`, {
    method: "PATCH",
    bodySchema: ScopedUpdateTelegramAiAccessInputSchema,
  });
}

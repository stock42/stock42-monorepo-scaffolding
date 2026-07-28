import { ScopedDeleteTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { proxyApi } from "@/lib/api-proxy";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(request, `/telegram-ai/access/${encodeURIComponent(id)}`, {
    method: "DELETE",
    bodySchema: ScopedDeleteTelegramAiAccessInputSchema,
  });
}

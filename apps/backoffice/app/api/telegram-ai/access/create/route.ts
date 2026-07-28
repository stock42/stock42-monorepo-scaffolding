import { CreateTelegramAiAccessInputSchema } from "@stock42/contracts/telegram-ai";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/telegram-ai/access/create", {
    method: "POST",
    bodySchema: CreateTelegramAiAccessInputSchema,
  });
}

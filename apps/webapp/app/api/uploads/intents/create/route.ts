import { UploadIntentInputSchema } from "@stock42/contracts/files";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/uploads/intents/create", {
    method: "POST",
    bodySchema: UploadIntentInputSchema,
  });
}

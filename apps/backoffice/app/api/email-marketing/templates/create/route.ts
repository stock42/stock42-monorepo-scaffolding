import { CreateEmailTemplateInputSchema } from "@stock42/contracts/email-marketing";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/email-templates/create", {
    method: "POST",
    bodySchema: CreateEmailTemplateInputSchema,
  });
}

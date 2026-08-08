import { CreateEmailCampaignInputSchema } from "@stock42/contracts/email-marketing";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/email-campaigns/create", {
    method: "POST",
    bodySchema: CreateEmailCampaignInputSchema,
  });
}

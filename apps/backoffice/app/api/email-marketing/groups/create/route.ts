import { CreateUserGroupInputSchema } from "@stock42/contracts/email-marketing";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/user-groups/create", {
    method: "POST",
    bodySchema: CreateUserGroupInputSchema,
  });
}

import { CreateAdministratorInputSchema } from "@stock42/contracts/tenancy";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/administrators/create", {
    method: "POST",
    bodySchema: CreateAdministratorInputSchema,
  });
}

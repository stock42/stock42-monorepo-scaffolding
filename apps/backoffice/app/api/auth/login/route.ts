import { LoginInputSchema } from "@stock42/contracts/auth";
import { proxyApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/auth/login", { method: "POST", bodySchema: LoginInputSchema });
}

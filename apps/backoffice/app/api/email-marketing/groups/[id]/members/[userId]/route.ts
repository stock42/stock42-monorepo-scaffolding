import { RemoveUserGroupMemberInputSchema } from "@stock42/contracts/email-marketing";
import { proxyApi } from "@/lib/api-proxy";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await context.params;
  return proxyApi(
    request,
    `/user-groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE", bodySchema: RemoveUserGroupMemberInputSchema },
  );
}

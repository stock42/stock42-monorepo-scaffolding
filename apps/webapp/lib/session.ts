import { apiRequest } from "@stock42/api-client";
import { MeResponseSchema, type SessionActor } from "@stock42/contracts/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3822";

function serializeCookies(values: { name: string; value: string }[]) {
  return values.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function getSessionActor(): Promise<SessionActor | null> {
  const cookieStore = await cookies();
  try {
    const { data } = await apiRequest({
      baseUrl: apiUrl,
      path: "/auth/me",
      schema: MeResponseSchema,
      cookie: serializeCookies(cookieStore.getAll()),
    });
    return data.data.actor;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionActor> {
  const actor = await getSessionActor();
  if (!actor || actor.kind !== "user") redirect("/login");
  return actor;
}

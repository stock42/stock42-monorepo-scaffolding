import { toBrowserResponse } from "@stock42/api-client/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  try {
    return toBrowserResponse(
      await fetch(new URL(`/artifacts/${encodeURIComponent(id)}`, apiUrl), {
        headers,
        cache: "no-store",
      }),
    );
  } catch {
    return Response.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: "La API no está disponible.",
          errorId: crypto.randomUUID(),
        },
      },
      { status: 502 },
    );
  }
}

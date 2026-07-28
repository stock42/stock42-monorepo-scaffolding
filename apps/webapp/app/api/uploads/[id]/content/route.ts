import { toBrowserResponse } from "@stock42/api-client/server";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = new Uint8Array(await request.arrayBuffer());
  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-length": String(bytes.byteLength),
  });
  const cookie = request.headers.get("cookie");
  const csrf = request.headers.get("x-csrf-token");
  if (cookie) headers.set("cookie", cookie);
  if (csrf) headers.set("x-csrf-token", csrf);

  try {
    return toBrowserResponse(
      await fetch(new URL(`/uploads/${encodeURIComponent(id)}/content`, apiUrl), {
        method: "PUT",
        headers,
        body: bytes,
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

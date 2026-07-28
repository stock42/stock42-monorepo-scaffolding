import { filterForwardHeaders } from "./index";

const allowedResponseHeaders = new Set([
  "content-type",
  "set-cookie",
  "x-correlation-id",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "retry-after",
]);

export function responseHeadersForBrowser(upstream: Response): Headers {
  const headers = filterForwardHeaders(upstream.headers);
  const result = new Headers();

  for (const [name, value] of headers.entries()) {
    if (allowedResponseHeaders.has(name.toLowerCase())) {
      result.append(name, value);
    }
  }

  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (getSetCookie) {
    result.delete("set-cookie");
    for (const cookie of getSetCookie.call(upstream.headers)) {
      result.append("set-cookie", cookie);
    }
  }

  return result;
}

export async function toBrowserResponse(upstream: Response): Promise<Response> {
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeadersForBrowser(upstream),
  });
}

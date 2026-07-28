import type { ApiConfig } from "@/config";

export const ACCESS_COOKIE = "s42_access";
export const REFRESH_COOKIE = "s42_refresh";
export const CSRF_CONTEXT_COOKIE = "s42_csrf_context";

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const rawValue = item.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }
  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean },
): string {
  return new Bun.Cookie(name, value, {
    httpOnly: true,
    maxAge: options.maxAge,
    path: "/",
    sameSite: "lax",
    secure: options.secure,
  }).serialize();
}

export function sessionCookieHeaders(
  tokens: { access: string; refresh: string },
  config: ApiConfig,
): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append(
    "set-cookie",
    serializeCookie(ACCESS_COOKIE, tokens.access, {
      maxAge: config.auth.accessTtlSeconds,
      secure: config.auth.secureCookies,
    }),
  );
  headers.append(
    "set-cookie",
    serializeCookie(REFRESH_COOKIE, tokens.refresh, {
      maxAge: config.auth.refreshTtlSeconds,
      secure: config.auth.secureCookies,
    }),
  );
  headers.append(
    "set-cookie",
    serializeCookie(CSRF_CONTEXT_COOKIE, "", {
      maxAge: 0,
      secure: config.auth.secureCookies,
    }),
  );
  return headers;
}

export function csrfContextCookie(contextId: string, config: ApiConfig): string {
  return serializeCookie(CSRF_CONTEXT_COOKIE, contextId, {
    maxAge: 600,
    secure: config.auth.secureCookies,
  });
}

export function clearSessionCookieHeaders(config: ApiConfig): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_CONTEXT_COOKIE]) {
    headers.append(
      "set-cookie",
      serializeCookie(name, "", {
        maxAge: 0,
        secure: config.auth.secureCookies,
      }),
    );
  }
  return headers;
}

import { SessionActorSchema } from "@stock42/contracts/auth";
import { z } from "zod";
import { HttpError } from "@/errors/HttpError";

const TokenClaimsSchema = z.object({
  iss: z.literal("stock42-api"),
  aud: z.literal("stock42-web"),
  sub: z.string().uuid(),
  type: z.enum(["access", "refresh"]),
  sid: z.string().uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  actor: SessionActorSchema,
});

export type TokenClaims = z.infer<typeof TokenClaimsSchema>;

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signToken(
  input: {
    type: TokenClaims["type"];
    sid: string;
    actor: TokenClaims["actor"];
    ttlSeconds: number;
  },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const claims: TokenClaims = {
    iss: "stock42-api",
    aud: "stock42-web",
    sub: input.actor.uuid,
    type: input.type,
    sid: input.sid,
    iat: now,
    exp: now + input.ttlSeconds,
    actor: input.actor,
  };
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const content = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret, "sign"),
    new TextEncoder().encode(content),
  );
  return `${content}.${Buffer.from(signature).toString("base64url")}`;
}

export async function verifyToken(
  token: string,
  expectedType: TokenClaims["type"],
  secret: string,
): Promise<TokenClaims> {
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra) {
    throw new HttpError(401, "UNAUTHENTICATED", "Credencial inválida.");
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await importKey(secret, "verify"),
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  if (!valid) throw new HttpError(401, "UNAUTHENTICATED", "Credencial inválida.");

  let decoded: unknown;
  try {
    decoded = JSON.parse(decode(payload));
  } catch {
    throw new HttpError(401, "UNAUTHENTICATED", "Credencial inválida.");
  }
  const claims = TokenClaimsSchema.safeParse(decoded);
  if (!claims.success || claims.data.type !== expectedType) {
    throw new HttpError(401, "UNAUTHENTICATED", "Credencial inválida.");
  }
  if (claims.data.exp <= Math.floor(Date.now() / 1_000)) {
    throw new HttpError(401, "UNAUTHENTICATED", "La sesión expiró.");
  }
  return claims.data;
}

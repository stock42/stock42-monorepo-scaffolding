import { createHmac, timingSafeEqual } from "node:crypto";
import { ActorRoleSchema, type ActorRole } from "@stock42/contracts/auth";
import { z } from "zod";
import type { AgentConfig } from "@/config";

const ServiceContextSchema = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().uuid(),
  actorRole: ActorRoleSchema,
});

function equal(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function authenticateServiceRequest(
  request: Request,
  body: Uint8Array,
  config: AgentConfig,
): { tenantId: string; actorId: string; actorRole: ActorRole } {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!equal(token, config.serviceToken)) throw new Error("Unauthorized service request");

  const timestamp = request.headers.get("x-service-timestamp") ?? "";
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 30_000) {
    throw new Error("Stale service request");
  }

  const url = new URL(request.url);
  const tenantId = request.headers.get("x-tenant-id") ?? "";
  const actorId = request.headers.get("x-actor-id") ?? "";
  const actorRole = request.headers.get("x-actor-role") ?? "";
  const expected = createHmac("sha256", config.serviceToken)
    .update(
      `${timestamp}\n${request.method}\n${url.pathname}${url.search}\n${tenantId}\n${actorId}\n${actorRole}\n`,
    )
    .update(body)
    .digest("base64url");
  const supplied = request.headers.get("x-service-signature") ?? "";
  if (!equal(supplied, expected)) throw new Error("Invalid service signature");

  return ServiceContextSchema.parse({
    tenantId,
    actorId,
    actorRole,
  });
}

import { isIP } from "node:net";

function normalizeIp(value: string): string | null {
  let candidate = value.trim().toLowerCase();
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }
  if (candidate.startsWith("::ffff:") && isIP(candidate.slice(7)) === 4) {
    candidate = candidate.slice(7);
  }
  return isIP(candidate) ? candidate : null;
}

export function resolveClientIp(input: {
  peerAddress: string | null | undefined;
  forwardedFor: string | null;
  trustedProxies: readonly string[];
}): string {
  const peer = normalizeIp(input.peerAddress ?? "") ?? "unknown";
  const trusted = new Set(
    input.trustedProxies.map(normalizeIp).filter((value): value is string => value !== null),
  );
  if (peer === "unknown" || !trusted.has(peer) || !input.forwardedFor) return peer;

  const chain = input.forwardedFor.split(",").map(normalizeIp);
  if (chain.some((value) => value === null)) return peer;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const address = chain[index]!;
    if (!trusted.has(address)) return address;
  }
  return chain[0] ?? peer;
}

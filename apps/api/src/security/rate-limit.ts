import { HttpError } from "@/errors/HttpError";

type Bucket = {
  count: number;
  resetAt: number;
};

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly enabled: boolean) {}

  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): { limit: number; remaining: number; resetAt: number } {
    if (!this.enabled) {
      return { limit, remaining: limit, resetAt: Date.now() + windowSeconds * 1_000 };
    }

    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowSeconds * 1_000 }
        : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (bucket.count > limit) {
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "Demasiadas solicitudes. Intentá nuevamente más tarde.",
        { retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)) },
      );
    }

    return {
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  sweep(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const remoteLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      analytics: true,
      prefix: "restaurant-outreach",
    })
  : null;

export async function enforceRateLimit(identifier: string) {
  if (remoteLimiter) {
    return remoteLimiter.limit(identifier);
  }

  const now = Date.now();
  const existing = memoryBuckets.get(identifier);
  if (!existing || existing.resetAt < now) {
    memoryBuckets.set(identifier, { count: 1, resetAt: now + 60_000 });
    return { success: true, remaining: 19, limit: 20, reset: now + 60_000 };
  }

  existing.count += 1;
  memoryBuckets.set(identifier, existing);

  return {
    success: existing.count <= 20,
    remaining: Math.max(0, 20 - existing.count),
    limit: 20,
    reset: existing.resetAt,
  };
}

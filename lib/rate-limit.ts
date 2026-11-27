// Simple in-memory fixed-window rate limiter.
// Resets on server restart and is per-process: fine for a single server.

type Bucket = { count: number; resetAt: number };

const globalForLimits = globalThis as unknown as {
  rateBuckets?: Map<string, Bucket>;
};
const buckets = (globalForLimits.rateBuckets ??= new Map<string, Bucket>());

export const LIMITS = {
  post: { max: 5, windowMs: 10 * 60_000 },
  comment: { max: 20, windowMs: 10 * 60_000 },
  like: { max: 60, windowMs: 60_000 },
  report: { max: 20, windowMs: 10 * 60_000 },
  view: { max: 120, windowMs: 10 * 60_000 },
} as const;

export type LimitName = keyof typeof LIMITS;

// A shared network (school, office, mobile carrier) can hold many people,
// so the per-IP allowance is more generous than the per-identity one.
const IP_MULTIPLIER = 4;

function hit(key: string, max: number, windowMs: number, now: number): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Returns true if the action is allowed for this identity and IP. */
export function rateLimit(
  name: LimitName,
  identityHash: string,
  ipHash: string,
): boolean {
  const { max, windowMs } = LIMITS[name];
  const now = Date.now();
  sweep(now);
  const idOk = hit(`${name}:id:${identityHash}`, max, windowMs, now);
  const ipOk = hit(`${name}:ip:${ipHash}`, max * IP_MULTIPLIER, windowMs, now);
  return idOk && ipOk;
}

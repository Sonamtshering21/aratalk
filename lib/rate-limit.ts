import { prisma } from "./prisma";

// Fixed-window rate limiter stored in Postgres, so every server instance
// (e.g. each Vercel function) shares the same counters.

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

const CLEANUP_CHANCE = 0.01;
const KEEP_EXPIRED_MS = 60 * 60_000; // longest window is 10 min; keep an hour

/** Returns true if the action is allowed for this identity and IP. */
export async function rateLimit(
  name: LimitName,
  identityHash: string,
  ipHash: string,
): Promise<boolean> {
  const { max, windowMs } = LIMITS[name];
  const now = Date.now();
  // Prisma stores UTC in `timestamp without time zone`; pass an ISO string and
  // cast, so the DB session time zone can't shift it.
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
  const idKey = `${name}:id:${identityHash}`;
  const ipKey = `${name}:ip:${ipHash}`;

  // One statement: both counters are created or incremented atomically, so
  // concurrent requests can't both read the same count.
  const rows = await prisma.$queryRaw<{ key: string; count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${idKey}, ${windowStart}::timestamp, 1), (${ipKey}, ${windowStart}::timestamp, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "key", "count"`;

  if (Math.random() < CLEANUP_CHANCE) {
    await prisma.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(now - KEEP_EXPIRED_MS) } },
    });
  }

  const count = (key: string) => rows.find((r) => r.key === key)?.count ?? Infinity;
  return count(idKey) <= max && count(ipKey) <= max * IP_MULTIPLIER;
}

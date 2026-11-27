import { prisma } from "./prisma";

// Fixed-window rate limiter stored in Postgres, so every server instance
// (e.g. each Vercel function) shares the same counters.
// Each write is checked per browser id AND per IP; posts also have a daily IP cap.
// Mobile carriers in Bhutan put many people behind one shared IP, so the
// per-browser limits do most of the work and the per-IP limits (10x looser)
// only stop large-scale abuse from one address.

type Rule = { max: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMITS = {
  post: { max: 1, windowMs: MINUTE },
  comment: { max: 1, windowMs: 20_000 },
  like: { max: 30, windowMs: MINUTE }, // post and comment likes share this
  view: { max: 1, windowMs: 10_000 }, // one view batch
  report: { max: 10, windowMs: HOUR },
} satisfies Record<string, Rule>;

/** Per-IP limit = this many times the per-browser limit. */
export const IP_MULTIPLIER = 10;

/** Extra IP-only caps on top of LIMITS. */
const IP_DAILY: Partial<Record<LimitName, Rule>> = {
  post: { max: 100, windowMs: DAY },
};

export type LimitName = keyof typeof LIMITS;

const CLEANUP_CHANCE = 0.01;

/** Returns true if the action is allowed for this browser id and IP. */
export async function rateLimit(
  name: LimitName,
  identityHash: string,
  ipHash: string,
): Promise<boolean> {
  const now = Date.now();
  const rule = LIMITS[name];
  const checks: { key: string; rule: Rule }[] = [
    { key: `${name}:id:${identityHash}`, rule },
    { key: `${name}:ip:${ipHash}`, rule: { ...rule, max: rule.max * IP_MULTIPLIER } },
  ];
  const daily = IP_DAILY[name];
  if (daily) checks.push({ key: `${name}:ipday:${ipHash}`, rule: daily });

  // Prisma stores UTC in `timestamp without time zone`; pass ISO strings and
  // cast, so the DB session time zone can't shift them.
  const windowStart = (r: Rule) =>
    new Date(Math.floor(now / r.windowMs) * r.windowMs).toISOString();
  const [k1, k2, k3] = checks;

  // One statement: every counter is created or incremented atomically, so
  // concurrent requests can't both read the same count.
  const rows = k3
    ? await prisma.$queryRaw<{ key: string; count: number }[]>`
        INSERT INTO "RateLimit" ("key", "windowStart", "count")
        VALUES (${k1.key}, ${windowStart(k1.rule)}::timestamp, 1),
               (${k2.key}, ${windowStart(k2.rule)}::timestamp, 1),
               (${k3.key}, ${windowStart(k3.rule)}::timestamp, 1)
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = "RateLimit"."count" + 1
        RETURNING "key", "count"`
    : await prisma.$queryRaw<{ key: string; count: number }[]>`
        INSERT INTO "RateLimit" ("key", "windowStart", "count")
        VALUES (${k1.key}, ${windowStart(k1.rule)}::timestamp, 1),
               (${k2.key}, ${windowStart(k2.rule)}::timestamp, 1)
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = "RateLimit"."count" + 1
        RETURNING "key", "count"`;

  if (Math.random() < CLEANUP_CHANCE) {
    // The longest window is a day; anything older than two days is dead.
    await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 2 * DAY) } } });
  }

  return checks.every(({ key, rule: r }) => {
    const count = rows.find((row) => row.key === key)?.count ?? Infinity;
    return count <= r.max;
  });
}

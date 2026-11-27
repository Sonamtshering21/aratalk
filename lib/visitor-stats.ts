import { connection } from "next/server";
import { prisma } from "./prisma";
import { READING_WINDOW_MS, bhutanMonth, previousMonth } from "./stats-time";

// "Reading now" and "visitors this month", from browser heartbeats.
// Only the anonymous identity hash is stored (never an IP), and only counts
// ever leave the server.

export type VisitorStats = { readingNow: number; visitorsThisMonth: number };

const CACHE_MS = 30_000;
const CLEANUP_CHANCE = 0.01;
const DAY_MS = 86_400_000;

// Prisma stores UTC in `timestamp without time zone`: pass ISO strings and cast.
const iso = (ms: number) => new Date(ms).toISOString();

/** Record a heartbeat: one statement updates presence and this month's visitors. */
export async function recordHeartbeat(userHash: string, now: number): Promise<void> {
  const month = bhutanMonth(now);
  await prisma.$executeRaw`
    WITH presence AS (
      INSERT INTO "Presence" ("userHash", "lastSeen") VALUES (${userHash}, ${iso(now)}::timestamp)
      ON CONFLICT ("userHash") DO UPDATE SET "lastSeen" = EXCLUDED."lastSeen"
      RETURNING 1
    )
    INSERT INTO "MonthlyVisitor" ("month", "userHash") VALUES (${month}, ${userHash})
    ON CONFLICT DO NOTHING`;

  if (Math.random() < CLEANUP_CHANCE) {
    await Promise.all([
      prisma.presence.deleteMany({ where: { lastSeen: { lt: new Date(now - DAY_MS) } } }),
      prisma.monthlyVisitor.deleteMany({ where: { month: { lt: previousMonth(month) } } }),
    ]);
  }
}

// Per server instance: the numbers are recomputed at most every 30 s.
const globalForStats = globalThis as unknown as {
  visitorStats?: { at: number; value: VisitorStats; pending?: Promise<VisitorStats> };
};

async function countStats(now: number): Promise<VisitorStats> {
  const [row] = await prisma.$queryRaw<{ reading: number; month: number }[]>`
    SELECT
      (SELECT count(*) FROM "Presence" WHERE "lastSeen" >= ${iso(now - READING_WINDOW_MS)}::timestamp)::int AS "reading",
      (SELECT count(*) FROM "MonthlyVisitor" WHERE "month" = ${bhutanMonth(now)})::int AS "month"`;
  return { readingNow: row?.reading ?? 0, visitorsThisMonth: row?.month ?? 0 };
}

/** Cached for ~30 s; concurrent callers share one query. */
export async function getVisitorStats(now: number): Promise<VisitorStats> {
  const cached = globalForStats.visitorStats;
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  if (cached?.pending) return cached.pending;

  const pending = countStats(now);
  globalForStats.visitorStats = { at: cached?.at ?? 0, value: cached?.value ?? { readingNow: 0, visitorsThisMonth: 0 }, pending };
  try {
    const value = await pending;
    globalForStats.visitorStats = { at: now, value };
    return value;
  } catch (e) {
    globalForStats.visitorStats = cached; // keep serving the last good numbers
    if (cached) return cached.value;
    throw e;
  }
}

/**
 * For pages: request-time numbers, or null if the database is unavailable
 * (the stats line is a nice-to-have and must never break the page).
 */
export async function loadVisitorStats(): Promise<VisitorStats | null> {
  await connection(); // request time, not prerendered
  try {
    return await getVisitorStats(Date.now());
  } catch {
    return null;
  }
}

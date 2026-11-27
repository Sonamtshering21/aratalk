import { prisma } from "./prisma";

// Ranked feeds (Trending/Top) change while someone scrolls: likes come in and
// trending scores decay. To page through them without duplicates or skipped
// posts, the first page freezes the ranked list of post ids, and later pages
// walk that frozen list by offset.
//
// Stored in Postgres so any server instance can serve the next page. It is only
// written when someone asks for page 2 (see lib/feed.ts), never on page views. A stateless
// "score + id" cursor was the alternative, but scores change between requests,
// which is exactly what causes duplicates and skips, so it can't give that
// guarantee. One small row per ranked first page is cheap; expired rows are
// pruned occasionally. If a snapshot has expired, the next page re-ranks and the
// browser drops ids it already shows.

const TTL_MS = 30 * 60_000;
const CLEANUP_CHANCE = 0.05;

export async function saveSnapshot(id: string, postIds: string[], now: number): Promise<void> {
  await prisma.feedSnapshot.create({
    data: { id, postIds, expiresAt: new Date(now + TTL_MS) },
    select: { id: true },
  });
  if (Math.random() < CLEANUP_CHANCE) {
    await prisma.feedSnapshot.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  }
}

/** The frozen id list, or null if it is missing or expired. */
export async function readSnapshot(id: string, now: number): Promise<string[] | null> {
  const snap = await prisma.feedSnapshot.findFirst({
    where: { id, expiresAt: { gt: new Date(now) } },
    select: { postIds: true },
  });
  return snap?.postIds ?? null;
}

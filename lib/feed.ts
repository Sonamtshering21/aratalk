import { connection } from "next/server";
import { z } from "zod";
import { prisma } from "./prisma";
import { readIdentityHash } from "./identity";
import { readSnapshot, saveSnapshot } from "./feed-snapshots";
import { PAGE_SIZE, type FeedPage, type FeedPost, type FeedTab, type TopRange } from "./feed-types";

// Explicit public fields. authorHash is never selected.
const cardFields = {
  id: true,
  title: true,
  body: true,
  nickname: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  createdAt: true,
} as const;

const DAY_MS = 86_400_000;
const TRENDING_WINDOW_DAYS = 30;
const TRENDING_POOL = 500;
const TOP_LIMIT = 1000;
const TOP_RANGE_DAYS: Record<TopRange, number | null> = { week: 7, month: 30, all: null };

// ---------------------------------------------------------------- ranking

/**
 * Engagement decayed by age (Hacker-News style gravity).
 * Comments weigh double a like; views count a little, since they're cheap.
 */
export function trendingScore(
  p: { likeCount: number; commentCount: number; viewCount: number; createdAt: Date },
  now: number,
): number {
  const ageHours = Math.max(0, (now - p.createdAt.getTime()) / 3_600_000);
  const engagement = 1 + p.likeCount + 2 * p.commentCount + 0.1 * p.viewCount;
  return engagement / Math.pow(ageHours + 2, 1.5);
}

async function rankTrending(now: number): Promise<string[]> {
  const pool = await prisma.post.findMany({
    where: { hidden: false, createdAt: { gte: new Date(now - TRENDING_WINDOW_DAYS * DAY_MS) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TRENDING_POOL,
    select: { id: true, likeCount: true, commentCount: true, viewCount: true, createdAt: true },
  });
  // Ties keep the pool's newest-first order (Array.prototype.sort is stable).
  return pool
    .map((p) => ({ id: p.id, score: trendingScore(p, now) }))
    .sort((a, b) => b.score - a.score)
    .map((p) => p.id);
}

async function rankTop(range: TopRange, now: number): Promise<string[]> {
  const days = TOP_RANGE_DAYS[range];
  const since = days === null ? new Date(0) : new Date(now - days * DAY_MS);
  // Prisma can't order by a sum of columns, so rank ids with parameterized SQL.
  // Prisma stores UTC in `timestamp without time zone`; a Date parameter would be
  // shifted by the DB session time zone, so compare against the UTC ISO string.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Post"
    WHERE "hidden" = false AND "createdAt" >= ${since.toISOString()}::timestamp
    ORDER BY ("likeCount" + "commentCount") DESC, "createdAt" DESC, "id" DESC
    LIMIT ${TOP_LIMIT}`;
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------- cursors

const cursorSchema = z.discriminatedUnion("k", [
  // Latest: keyset on (createdAt, id), both immutable.
  z.object({ k: z.literal("t"), c: z.number().int().nonnegative(), i: z.string().min(1).max(40) }),
  // Ranked: offset into a frozen snapshot of ids.
  z.object({
    k: z.literal("s"),
    s: z.string().uuid(),
    o: z.number().int().nonnegative().max(TOP_LIMIT),
  }),
]);
type Cursor = z.infer<typeof cursorSchema>;

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- pages

type CardRow = {
  id: string;
  title: string;
  body: string;
  nickname: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: Date;
};

export function excerpt(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

async function toFeedPosts(rows: CardRow[]): Promise<FeedPost[]> {
  const hash = await readIdentityHash();
  const liked = new Set<string>();
  if (hash && rows.length > 0) {
    const likes = await prisma.like.findMany({
      where: { userHash: hash, postId: { in: rows.map((r) => r.id) } },
      select: { postId: true },
    });
    for (const l of likes) liked.add(l.postId);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    excerpt: excerpt(r.body),
    nickname: r.nickname,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    viewCount: r.viewCount,
    createdAt: r.createdAt.toISOString(),
    likedByMe: liked.has(r.id),
  }));
}

async function latestPage(cursor: Cursor | null, readAt: number): Promise<FeedPage> {
  const after =
    cursor?.k === "t"
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.c) } },
            { createdAt: new Date(cursor.c), id: { lt: cursor.i } },
          ],
        }
      : {};
  const rows = await prisma.post.findMany({
    where: { hidden: false, ...after },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: cardFields,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    posts: await toFeedPosts(page),
    nextCursor:
      hasMore && last ? encodeCursor({ k: "t", c: last.createdAt.getTime(), i: last.id }) : null,
    readAt,
  };
}

async function rankedPage(
  tab: "trending" | "top",
  range: TopRange,
  cursor: Cursor | null,
  readAt: number,
): Promise<FeedPage> {
  const offset = cursor?.k === "s" ? cursor.o : 0;
  let snapshotId = cursor?.k === "s" ? cursor.s : null;
  let ids = snapshotId ? await readSnapshot(snapshotId, readAt) : null;

  if (!ids) {
    // First page, or the snapshot expired: rank now and freeze the result.
    ids = tab === "trending" ? await rankTrending(readAt) : await rankTop(range, readAt);
    snapshotId = ids.length > offset + PAGE_SIZE ? await saveSnapshot(ids, readAt) : null;
  }

  const pageIds = ids.slice(offset, offset + PAGE_SIZE);
  const rows = await prisma.post.findMany({
    // Posts hidden since the snapshot was taken are simply skipped.
    where: { id: { in: pageIds }, hidden: false },
    select: cardFields,
  });
  const order = new Map(pageIds.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  const nextOffset = offset + PAGE_SIZE;
  return {
    posts: await toFeedPosts(rows),
    nextCursor:
      snapshotId && nextOffset < ids.length
        ? encodeCursor({ k: "s", s: snapshotId, o: nextOffset })
        : null,
    readAt,
  };
}

export async function getFeedPage(
  tab: FeedTab,
  range: TopRange,
  rawCursor: string | null,
): Promise<FeedPage> {
  await connection(); // request-time only: never prerender the clock
  const readAt = Date.now();
  const cursor = decodeCursor(rawCursor);
  if (tab === "latest") return latestPage(cursor?.k === "t" ? cursor : null, readAt);
  return rankedPage(tab, range, cursor?.k === "s" ? cursor : null, readAt);
}

/** Lightweight check for the "New posts" pill. The viewer's own posts don't count. */
export async function countPostsSince(sinceMs: number): Promise<number> {
  await connection();
  const me = await readIdentityHash();
  return prisma.post.count({
    where: {
      hidden: false,
      createdAt: { gt: new Date(sinceMs) },
      ...(me ? { authorHash: { not: me } } : {}),
    },
  });
}

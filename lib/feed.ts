import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { connection } from "next/server";
import { z } from "zod";
import { prisma } from "./prisma";
import { readIdentityHash } from "./identity";
import { readSnapshot, saveSnapshot } from "./feed-snapshots";
import { PAGE_SIZE, type FeedPage, type FeedPost, type FeedTab, type TopRange } from "./feed-types";

// Feed pages are built to need as few database round trips as possible:
// - Latest: one query (posts + this browser's like/share flags, joined).
// - Trending/Top page 1: one SQL statement (ranking + posts + flags). No writes.
// - Trending/Top page 2: re-rank at page 1's moment, minus page 1's ids (carried
//   in the cursor), then save a snapshot of the rest in parallel with loading
//   the page. Later pages walk that snapshot. So likes arriving mid-scroll can't
//   cause duplicates or skips, and nothing is written unless someone scrolls.

const DAY_MS = 86_400_000;
const TRENDING_WINDOW_DAYS = 30;
const TRENDING_POOL = 500;
const TOP_LIMIT = 1000;
const TOP_RANGE_DAYS: Record<TopRange, number | null> = { week: 7, month: 30, all: null };
const EXCERPT_SOURCE_CHARS = 400; // enough for a 180-character excerpt

/**
 * Trending score = engagement decayed by age (Hacker-News style gravity):
 *   (1 + likes + 2·comments + 0.5·shares + 0.1·views) / (ageHours + 2)^1.5
 * Computed in SQL so ranking and loading the first page is one statement.
 */
export const SHARE_WEIGHT = 0.5;

// Prisma stores UTC in `timestamp without time zone`; pass ISO strings and cast,
// so the DB session time zone can't shift them.
const ts = (ms: number) => Prisma.sql`${new Date(ms).toISOString()}::timestamp`;

/** FROM/WHERE and ORDER BY for a ranked tab, evaluated as of `at`. */
function ranking(tab: "trending" | "top", range: TopRange, at: number) {
  if (tab === "trending") {
    return {
      from: Prisma.sql`FROM (
        SELECT * FROM "Post"
        WHERE "hidden" = false AND "createdAt" >= ${ts(at - TRENDING_WINDOW_DAYS * DAY_MS)}
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT ${TRENDING_POOL}
      ) p`,
      order: Prisma.sql`(
        (1 + p."likeCount" + 2 * p."commentCount" + ${SHARE_WEIGHT}::float8 * p."shareCount" + 0.1 * p."viewCount")
        / power(GREATEST(0, EXTRACT(EPOCH FROM (${ts(at)} - p."createdAt")) / 3600.0) + 2, 1.5)
      ) DESC, p."createdAt" DESC, p."id" DESC`,
      limit: TRENDING_POOL,
    };
  }
  const days = TOP_RANGE_DAYS[range];
  return {
    from: Prisma.sql`FROM "Post" p WHERE p."hidden" = false AND p."createdAt" >= ${ts(days === null ? 0 : at - days * DAY_MS)}`,
    order: Prisma.sql`(p."likeCount" + p."commentCount") DESC, p."createdAt" DESC, p."id" DESC`,
    limit: TOP_LIMIT,
  };
}

// ---------------------------------------------------------------- cursors

const idList = z.array(z.string().min(1).max(40)).max(PAGE_SIZE);

const cursorSchema = z.discriminatedUnion("k", [
  // Latest: keyset on (createdAt, id), both immutable.
  z.object({ k: z.literal("t"), c: z.number().int().nonnegative(), i: z.string().min(1).max(40) }),
  // Ranked page 2: re-rank as of time `t`, without the ids already shown (`x`).
  z.object({ k: z.literal("r"), t: z.number().int().nonnegative(), x: idList }),
  // Ranked page 3+: offset into a frozen snapshot of ids.
  z.object({ k: z.literal("s"), s: z.string().uuid(), o: z.number().int().nonnegative().max(TOP_LIMIT) }),
]);
type Cursor = z.infer<typeof cursorSchema>;

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");

function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 2000) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- rows

export function excerpt(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

type CardRow = {
  id: string;
  title: string;
  body: string;
  nickname: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  shareCount: number;
  createdAt: Date;
  likedByMe: boolean;
  sharedByMe: boolean;
};

const toFeedPost = (r: CardRow): FeedPost => ({
  id: r.id,
  title: r.title,
  excerpt: excerpt(r.body),
  nickname: r.nickname,
  likeCount: r.likeCount,
  commentCount: r.commentCount,
  viewCount: r.viewCount,
  shareCount: r.shareCount,
  createdAt: r.createdAt.toISOString(),
  likedByMe: r.likedByMe,
  sharedByMe: r.sharedByMe,
});

/** Public card fields plus this browser's like/share flags, joined in one query. */
function cardSelect(viewer: string | null) {
  const mine = { where: { userHash: viewer ?? "" }, select: { postId: true }, take: 1 } as const;
  return {
    id: true,
    title: true,
    body: true,
    nickname: true,
    likeCount: true,
    commentCount: true,
    viewCount: true,
    shareCount: true,
    createdAt: true,
    likes: mine,
    shares: mine,
  } as const;
}

type CardWithFlags = Omit<CardRow, "likedByMe" | "sharedByMe"> & {
  likes: { postId: string }[];
  shares: { postId: string }[];
};
const withFlags = ({ likes, shares, ...r }: CardWithFlags): CardRow => ({
  ...r,
  likedByMe: likes.length > 0,
  sharedByMe: shares.length > 0,
});

/** Cards for these ids, in this order (posts hidden since are skipped). */
async function cardsByIds(ids: string[], viewer: string | null): Promise<CardRow[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.post.findMany({
    where: { id: { in: ids }, hidden: false },
    select: cardSelect(viewer),
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.map(withFlags).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

// ---------------------------------------------------------------- pages

async function latestPage(cursor: Cursor | null, viewer: string | null, readAt: number): Promise<FeedPage> {
  const after =
    cursor?.k === "t"
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.c) } },
            { createdAt: new Date(cursor.c), id: { lt: cursor.i } },
          ],
        }
      : {};
  const rows = (
    await prisma.post.findMany({
      where: { hidden: false, ...after },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      select: cardSelect(viewer),
    })
  ).map(withFlags);
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    posts: page.map(toFeedPost),
    nextCursor:
      rows.length > PAGE_SIZE && last ? encodeCursor({ k: "t", c: last.createdAt.getTime(), i: last.id }) : null,
    readAt,
  };
}

/** Ranked first page: rank + load + flags in a single statement. */
async function rankedFirstPage(tab: "trending" | "top", range: TopRange, viewer: string | null, readAt: number): Promise<FeedPage> {
  const { from, order } = ranking(tab, range, readAt);
  const me = viewer ?? "";
  const rows = await prisma.$queryRaw<CardRow[]>`
    SELECT p."id", p."title", left(p."body", ${EXCERPT_SOURCE_CHARS}::int) AS "body", p."nickname",
           p."likeCount", p."commentCount", p."viewCount", p."shareCount", p."createdAt",
           EXISTS (SELECT 1 FROM "Like" l WHERE l."postId" = p."id" AND l."userHash" = ${me}) AS "likedByMe",
           EXISTS (SELECT 1 FROM "PostShare" s WHERE s."postId" = p."id" AND s."userHash" = ${me}) AS "sharedByMe"
    ${from}
    ORDER BY ${order}
    LIMIT ${PAGE_SIZE + 1}`;
  const page = rows.slice(0, PAGE_SIZE);
  return {
    posts: page.map(toFeedPost),
    nextCursor:
      rows.length > PAGE_SIZE ? encodeCursor({ k: "r", t: readAt, x: page.map((r) => r.id) }) : null,
    readAt,
  };
}

async function rankIds(tab: "trending" | "top", range: TopRange, at: number): Promise<string[]> {
  const { from, order, limit } = ranking(tab, range, at);
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT p."id" ${from} ORDER BY ${order} LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** Ranked page 2+: walk a snapshot, creating it (only now) when page 2 is requested. */
async function rankedNextPage(
  tab: "trending" | "top",
  range: TopRange,
  cursor: Extract<Cursor, { k: "r" | "s" }>,
  viewer: string | null,
  readAt: number,
): Promise<FeedPage> {
  let rest: string[] | null = null;
  let snapshotId: string | null = null;
  let offset = 0;

  if (cursor.k === "s") {
    rest = await readSnapshot(cursor.s, readAt);
    snapshotId = rest ? cursor.s : null;
    offset = cursor.o;
  }
  if (!rest) {
    // Page 2 (or an expired snapshot): rank as of page 1's moment when we know
    // it, and leave out what page 1 already showed.
    const shown = new Set(cursor.k === "r" ? cursor.x : []);
    rest = (await rankIds(tab, range, cursor.k === "r" ? cursor.t : readAt)).filter((id) => !shown.has(id));
    if (cursor.k === "s") offset = Math.min(cursor.o, rest.length); // expired: best effort, the browser dedupes
  }

  const pageIds = rest.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const needsSnapshot = !snapshotId && nextOffset < rest.length;
  const newId = needsSnapshot ? randomUUID() : null;

  // Saving the snapshot and loading this page don't depend on each other.
  const [rows] = await Promise.all([
    cardsByIds(pageIds, viewer),
    newId ? saveSnapshot(newId, rest, readAt) : null,
  ]);
  const id = snapshotId ?? newId;
  return {
    posts: rows.map(toFeedPost),
    nextCursor: id && nextOffset < rest.length ? encodeCursor({ k: "s", s: id, o: nextOffset }) : null,
    readAt,
  };
}

export async function getFeedPage(tab: FeedTab, range: TopRange, rawCursor: string | null): Promise<FeedPage> {
  await connection(); // request-time only: never prerender the clock
  const readAt = Date.now();
  const [cursor, viewer] = [decodeCursor(rawCursor), await readIdentityHash()];
  if (tab === "latest") return latestPage(cursor?.k === "t" ? cursor : null, viewer, readAt);
  if (cursor && cursor.k !== "t") return rankedNextPage(tab, range, cursor, viewer, readAt);
  return rankedFirstPage(tab, range, viewer, readAt);
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

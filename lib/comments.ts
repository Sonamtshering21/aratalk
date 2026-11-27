import { prisma } from "./prisma";
import { readIdentityHash } from "./identity";
import {
  COMMENTS_PAGE_SIZE,
  REPLIES_PAGE_SIZE,
  REPLIES_PREVIEW,
  type CommentItem,
  type RepliesPage,
  type ThreadItem,
  type ThreadsPage,
} from "./comment-types";

export type { CommentItem } from "./comment-types";

// Comments are always paginated:
// - top-level comments: 20 per page, newest first (keyset on createdAt, id);
// - replies: the first 3 come with their thread, then 20 per page, oldest first.
// authorHash is never selected; a hidden comment's text never leaves the server.

const fields = {
  id: true,
  body: true,
  nickname: true,
  likeCount: true,
  hidden: true,
  createdAt: true,
} as const;

type Row = {
  id: string;
  body: string;
  nickname: string;
  likeCount: number;
  hidden: boolean;
  createdAt: Date;
};

// ---------------------------------------------------------------- cursors

type Key = { c: number; i: string };

const encode = (row: { createdAt: Date; id: string }) =>
  Buffer.from(JSON.stringify({ c: row.createdAt.getTime(), i: row.id })).toString("base64url");

function decode(raw: string | null | undefined): Key | null {
  if (!raw || raw.length > 120) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Key>;
    return typeof v.c === "number" && typeof v.i === "string" && v.i.length <= 40
      ? { c: v.c, i: v.i }
      : null;
  } catch {
    return null;
  }
}

const before = (k: Key) => ({
  OR: [{ createdAt: { lt: new Date(k.c) } }, { createdAt: new Date(k.c), id: { lt: k.i } }],
});
const after = (k: Key) => ({
  OR: [{ createdAt: { gt: new Date(k.c) } }, { createdAt: new Date(k.c), id: { gt: k.i } }],
});

// ---------------------------------------------------------------- helpers

/** Public fields plus whether this browser liked it (joined in the same query). */
const withMyLike = (viewer: string) =>
  ({ ...fields, likes: { where: { userHash: viewer }, select: { commentId: true }, take: 1 } }) as const;

type RowWithLike = Row & { likes: { commentId: string }[] };

const toItem = (r: RowWithLike): CommentItem => ({
  id: r.id,
  body: r.body,
  nickname: r.nickname,
  likeCount: r.likeCount,
  createdAt: r.createdAt.toISOString(),
  likedByMe: r.likes.length > 0,
});

// ---------------------------------------------------------------- pages

/** One page of top-level comments for a visible post, newest first. */
export async function getThreadsPage(postId: string, rawCursor: string | null): Promise<ThreadsPage> {
  const cursor = decode(rawCursor);
  const viewer = (await readIdentityHash()) ?? "";
  // One query: comments, their first replies, reply counts and like flags.
  const rows = await prisma.comment.findMany({
    where: {
      postId,
      parentId: null,
      // A hidden comment stays (as a placeholder) only if it has visible replies.
      AND: [
        { OR: [{ hidden: false }, { replies: { some: { hidden: false } } }] },
        ...(cursor ? [before(cursor)] : []),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: COMMENTS_PAGE_SIZE + 1,
    select: {
      ...withMyLike(viewer),
      replies: {
        where: { hidden: false },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: REPLIES_PREVIEW,
        select: withMyLike(viewer),
      },
      _count: { select: { replies: { where: { hidden: false } } } },
    },
  });

  const page = rows.slice(0, COMMENTS_PAGE_SIZE);
  const threads: ThreadItem[] = page.map((r) => {
    const last = r.replies[r.replies.length - 1];
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      comment: r.hidden ? null : toItem(r),
      replies: r.replies.map(toItem),
      replyCount: r._count.replies,
      repliesCursor: last && r._count.replies > r.replies.length ? encode(last) : null,
    };
  });
  const tail = page[page.length - 1];
  return {
    threads,
    nextCursor: rows.length > COMMENTS_PAGE_SIZE && tail ? encode(tail) : null,
  };
}

/** One page of replies to a top-level comment, oldest first, after `rawCursor`. */
export async function getRepliesPage(parentId: string, rawCursor: string | null): Promise<RepliesPage> {
  const cursor = decode(rawCursor);
  const viewer = (await readIdentityHash()) ?? "";
  const rows = await prisma.comment.findMany({
    where: { parentId, hidden: false, ...(cursor ? after(cursor) : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: REPLIES_PAGE_SIZE + 1,
    select: withMyLike(viewer),
  });
  const page = rows.slice(0, REPLIES_PAGE_SIZE);
  const tail = page[page.length - 1];
  return {
    replies: page.map(toItem),
    nextCursor: rows.length > REPLIES_PAGE_SIZE && tail ? encode(tail) : null,
  };
}

/** Is this a top-level comment on a visible post? (Guards the replies endpoint.) */
export async function isThreadOnVisiblePost(commentId: string): Promise<boolean> {
  const row = await prisma.comment.findFirst({
    where: { id: commentId, parentId: null, post: { hidden: false } },
    select: { id: true },
  });
  return row !== null;
}

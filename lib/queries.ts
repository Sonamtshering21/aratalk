import { connection } from "next/server";
import { prisma } from "./prisma";
import { readIdentityHash } from "./identity";

// Explicit public field lists. authorHash / userHash are never selected here.
const publicPostFields = {
  id: true,
  title: true,
  body: true,
  nickname: true,
  likeCount: true,
  commentCount: true,
  createdAt: true,
} as const;

// `hidden` and `parentId` are used on the server to build threads; the body
// of a hidden comment is dropped before anything reaches the client.
const commentFields = {
  id: true,
  parentId: true,
  body: true,
  nickname: true,
  likeCount: true,
  hidden: true,
  createdAt: true,
} as const;

export type FeedTab = "newest" | "trending";

export type PostView = {
  id: string;
  title: string;
  body: string;
  nickname: string;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  likedByMe: boolean;
};

export type CommentView = {
  id: string;
  body: string;
  nickname: string;
  likeCount: number;
  createdAt: Date;
  likedByMe: boolean;
};

/** A top-level comment with its replies. `comment` is null when it was hidden. */
export type ThreadView = {
  id: string;
  comment: CommentView | null;
  replies: CommentView[];
};

const FEED_SIZE = 50;
const TRENDING_WINDOW_DAYS = 30;
const TRENDING_POOL = 300;

/**
 * Engagement decayed by age (Hacker-News style gravity).
 * Comments weigh double since they take more effort than a like.
 */
export function trendingScore(
  likes: number,
  comments: number,
  createdAt: Date,
  now: number,
): number {
  const ageHours = Math.max(0, (now - createdAt.getTime()) / 3_600_000);
  return (1 + likes + 2 * comments) / Math.pow(ageHours + 2, 1.5);
}

async function likedSet(postIds: string[]): Promise<Set<string>> {
  const hash = await readIdentityHash();
  if (!hash || postIds.length === 0) return new Set();
  const likes = await prisma.like.findMany({
    where: { userHash: hash, postId: { in: postIds } },
    select: { postId: true },
  });
  return new Set(likes.map((l) => l.postId));
}

/** `readAt` is the server time the data was read, used for "5 minutes ago". */
export async function getFeed(
  tab: FeedTab,
): Promise<{ posts: PostView[]; readAt: number }> {
  await connection(); // request-time only: never prerender the clock
  const readAt = Date.now();
  let posts;
  if (tab === "trending") {
    const since = new Date(readAt - TRENDING_WINDOW_DAYS * 86_400_000);
    const pool = await prisma.post.findMany({
      where: { hidden: false, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: TRENDING_POOL,
      select: publicPostFields,
    });
    posts = pool
      .map((p) => ({
        p,
        score: trendingScore(p.likeCount, p.commentCount, p.createdAt, readAt),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, FEED_SIZE)
      .map(({ p }) => p);
  } else {
    posts = await prisma.post.findMany({
      where: { hidden: false },
      orderBy: { createdAt: "desc" },
      take: FEED_SIZE,
      select: publicPostFields,
    });
  }

  const liked = await likedSet(posts.map((p) => p.id));
  return { posts: posts.map((p) => ({ ...p, likedByMe: liked.has(p.id) })), readAt };
}

export async function getPostPage(
  id: string,
): Promise<{ post: PostView; threads: ThreadView[]; readAt: number } | null> {
  await connection(); // request-time only: never prerender the clock
  const readAt = Date.now();
  const [post, threads] = await Promise.all([getPost(id), getThreads(id)]);
  return post ? { post, threads, readAt } : null;
}

async function getPost(id: string): Promise<PostView | null> {
  const post = await prisma.post.findFirst({
    where: { id, hidden: false },
    select: publicPostFields,
  });
  if (!post) return null;
  const liked = await likedSet([post.id]);
  return { ...post, likedByMe: liked.has(post.id) };
}

async function getThreads(postId: string): Promise<ThreadView[]> {
  const [rows, hash] = await Promise.all([
    prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      take: 1000,
      select: commentFields,
    }),
    readIdentityHash(),
  ]);

  const liked = new Set<string>();
  if (hash && rows.length > 0) {
    const likes = await prisma.commentLike.findMany({
      where: { userHash: hash, commentId: { in: rows.map((r) => r.id) } },
      select: { commentId: true },
    });
    for (const l of likes) liked.add(l.commentId);
  }

  const toView = (r: (typeof rows)[number]): CommentView => ({
    id: r.id,
    body: r.body,
    nickname: r.nickname,
    likeCount: r.likeCount,
    createdAt: r.createdAt,
    likedByMe: liked.has(r.id),
  });

  const repliesByParent = new Map<string, CommentView[]>();
  for (const r of rows) {
    if (!r.parentId || r.hidden) continue;
    const list = repliesByParent.get(r.parentId) ?? [];
    list.push(toView(r));
    repliesByParent.set(r.parentId, list);
  }

  const threads: ThreadView[] = [];
  for (const r of rows) {
    if (r.parentId) continue;
    const replies = repliesByParent.get(r.id) ?? [];
    // A hidden comment stays as a placeholder only if it has visible replies.
    if (r.hidden && replies.length === 0) continue;
    threads.push({ id: r.id, comment: r.hidden ? null : toView(r), replies });
  }
  return threads;
}

export function excerpt(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

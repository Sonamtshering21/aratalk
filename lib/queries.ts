import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "./prisma";
import { readIdentityHash } from "./identity";
import { getThreadsPage } from "./comments";
import type { ThreadsPage } from "./comment-types";

// Explicit public field lists. authorHash / userHash are never selected here.
const publicPostFields = {
  id: true,
  title: true,
  body: true,
  nickname: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  shareCount: true,
  createdAt: true,
} as const;

// (Not named PostView: that is the Prisma model for per-browser view dedupe.)
export type PostDetail = {
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

export async function getPostPage(
  id: string,
): Promise<{ post: PostDetail; comments: ThreadsPage; readAt: number } | null> {
  await connection(); // request-time only: never prerender the clock
  const readAt = Date.now();
  // Independent: load the post and the first page of comments together.
  // (A hidden post's comments are discarded below and never sent.)
  const [post, comments] = await Promise.all([getPost(id), getThreadsPage(id, null)]);
  if (!post) return null;
  return { post, comments, readAt };
}

/**
 * The post plus this browser's like/share flags, in one query. Wrapped in React
 * cache() so the page and its metadata share a single lookup per request.
 */
const getPost = cache(async (id: string): Promise<PostDetail | null> => {
  if (!id || id.length > 40) return null;
  const viewer = (await readIdentityHash()) ?? "";
  const mine = { where: { userHash: viewer }, select: { postId: true }, take: 1 } as const;
  const row = await prisma.post.findFirst({
    where: { id, hidden: false },
    select: { ...publicPostFields, likes: mine, shares: mine },
  });
  if (!row) return null;
  const { likes, shares, ...post } = row;
  return { ...post, likedByMe: likes.length > 0, sharedByMe: shares.length > 0 };
});

/** Public fields for link previews (metadata). Null if hidden or missing. */
export async function getPostPreview(
  id: string,
): Promise<{ title: string; body: string; nickname: string } | null> {
  return getPost(id);
}

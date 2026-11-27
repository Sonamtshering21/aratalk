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
  const post = await getPost(id);
  if (!post) return null;
  // Only the first page of comments; the rest load on demand.
  const comments = await getThreadsPage(post.id, null);
  return { post, comments, readAt };
}

async function getPost(id: string): Promise<PostDetail | null> {
  const [post, hash] = await Promise.all([
    prisma.post.findFirst({ where: { id, hidden: false }, select: publicPostFields }),
    readIdentityHash(),
  ]);
  if (!post) return null;
  const [liked, shared] = hash
    ? await Promise.all([
        prisma.like.findUnique({
          where: { postId_userHash: { postId: post.id, userHash: hash } },
          select: { postId: true },
        }),
        prisma.postShare.findUnique({
          where: { postId_userHash: { postId: post.id, userHash: hash } },
          select: { postId: true },
        }),
      ])
    : [null, null];
  return { ...post, likedByMe: liked !== null, sharedByMe: shared !== null };
}

/** Public fields for link previews (metadata and the OG image). Null if hidden or missing. */
export async function getPostPreview(
  id: string,
): Promise<{ title: string; body: string; nickname: string } | null> {
  if (!id || id.length > 40) return null;
  return prisma.post.findFirst({
    where: { id, hidden: false },
    select: { title: true, body: true, nickname: true },
  });
}

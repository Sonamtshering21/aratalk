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
  viewCount: true,
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

// (Not named PostView: that is the Prisma model for daily view dedupe.)
export type PostDetail = {
  id: string;
  title: string;
  body: string;
  nickname: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
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

export async function getPostPage(
  id: string,
): Promise<{ post: PostDetail; threads: ThreadView[]; readAt: number } | null> {
  await connection(); // request-time only: never prerender the clock
  const readAt = Date.now();
  const [post, threads] = await Promise.all([getPost(id), getThreads(id)]);
  return post ? { post, threads, readAt } : null;
}

async function getPost(id: string): Promise<PostDetail | null> {
  const [post, hash] = await Promise.all([
    prisma.post.findFirst({ where: { id, hidden: false }, select: publicPostFields }),
    readIdentityHash(),
  ]);
  if (!post) return null;
  const liked = hash
    ? await prisma.like.findUnique({
        where: { postId_userHash: { postId: post.id, userHash: hash } },
        select: { postId: true },
      })
    : null;
  return { ...post, likedByMe: liked !== null };
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

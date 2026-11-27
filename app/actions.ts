"use server";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isCrawler } from "@/lib/bots";
import type { CommentItem } from "@/lib/comment-types";
import { prisma } from "@/lib/prisma";
import { hashedIp, requireIdentity, type Identity } from "@/lib/identity";
import { rateLimit, type LimitName } from "@/lib/rate-limit";
import {
  MAX_LINKS,
  commentSchema,
  countLinks,
  firstError,
  idSchema,
  postSchema,
  reportSchema,
} from "@/lib/validation";

// Server Actions always answer with HTTP 200 (Next.js has no way to set their
// status), so refusals carry the status in the result: 401 no browser cookie,
// 403 crawler, 429 rate limited. The /api/views route returns real statuses.
export type DeniedStatus = 401 | 403 | 429;

export type FormState = {
  error?: string;
  status?: DeniedStatus;
  ok?: boolean;
  nonce?: number;
  /** The created reply, so the thread can show it without loading every reply. */
  reply?: CommentItem;
};

const HIDE_AFTER_REPORTS = 5;
const DUPLICATE_WINDOW_MS = 60 * 60_000;

const DENIED: Record<DeniedStatus, string> = {
  401: "Please refresh the page and try again.",
  403: "This action isn't available.",
  429: "You're going a bit fast. Have a sip of Ara and try again in a moment.",
};
type Denied = { error: string; status: DeniedStatus };
const deny = (status: DeniedStatus): Denied => ({ error: DENIED[status], status });

/** Who is writing: a real browser with the anonymous cookie, or a refusal. */
async function writer(): Promise<Identity | Denied> {
  if (isCrawler((await headers()).get("user-agent"))) return deny(403);
  return (await requireIdentity()) ?? deny(401);
}
const isDenied = (v: Identity | Denied): v is Denied => "status" in v;

async function withinLimit(name: LimitName, me: Identity): Promise<boolean> {
  return rateLimit(name, me.hash, await hashedIp());
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** Bots tend to fill every field; humans never see this one. */
const isBot = (formData: FormData) => field(formData, "website").length > 0;

// ---------------------------------------------------------------- posts

export async function createPost(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) redirect("/");

  const parsed = postSchema.safeParse({
    title: field(formData, "title"),
    body: field(formData, "body"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { title, body } = parsed.data;

  if (countLinks(title) + countLinks(body) > MAX_LINKS) {
    return { error: `Please keep it to ${MAX_LINKS} links or fewer.` };
  }

  const me = await writer();
  if (isDenied(me)) return me;
  if (!(await withinLimit("post", me))) return deny(429);

  const duplicate = await prisma.post.findFirst({
    where: {
      title,
      body,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { error: "This exact post was already shared in the last hour." };
  }

  const post = await prisma.post.create({
    data: { title, body, nickname: me.nickname, authorHash: me.hash },
    select: { id: true },
  });

  redirect(`/post/${post.id}`);
}

// ---------------------------------------------------------------- likes

export type LikeResult =
  | { ok: true; liked: boolean; likeCount: number }
  | { ok: false; error: string; status?: DeniedStatus };

export async function toggleLike(postId: string): Promise<LikeResult> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "Post not found." };

  const me = await writer();
  if (isDenied(me)) return { ok: false, ...me };
  if (!(await withinLimit("like", me))) return { ok: false, ...deny(429) };

  const post = await prisma.post.findFirst({
    where: { id: id.data, hidden: false },
    select: { id: true },
  });
  if (!post) return { ok: false, error: "Post not found." };

  try {
    return await prisma.$transaction(async (tx) => {
      const removed = await tx.like.deleteMany({
        where: { postId: post.id, userHash: me.hash },
      });
      const liked = removed.count === 0;
      if (liked) {
        await tx.like.create({ data: { postId: post.id, userHash: me.hash } });
      }
      const updated = await tx.post.update({
        where: { id: post.id },
        data: { likeCount: { increment: liked ? 1 : -1 } },
        select: { likeCount: true },
      });
      return { ok: true as const, liked, likeCount: updated.likeCount };
    });
  } catch (e) {
    // Two quick taps racing each other: the like already exists.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const current = await prisma.post.findUnique({
        where: { id: post.id },
        select: { likeCount: true },
      });
      return { ok: true, liked: true, likeCount: current?.likeCount ?? 0 };
    }
    throw e;
  }
}

/** Like/unlike a comment or reply. Shares the post like rate limit. */
export async function toggleCommentLike(commentId: string): Promise<LikeResult> {
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { ok: false, error: "Comment not found." };

  const me = await writer();
  if (isDenied(me)) return { ok: false, ...me };
  if (!(await withinLimit("like", me))) return { ok: false, ...deny(429) };

  const comment = await prisma.comment.findFirst({
    where: { id: id.data, hidden: false, post: { hidden: false } },
    select: { id: true },
  });
  if (!comment) return { ok: false, error: "Comment not found." };

  try {
    return await prisma.$transaction(async (tx) => {
      const removed = await tx.commentLike.deleteMany({
        where: { commentId: comment.id, userHash: me.hash },
      });
      const liked = removed.count === 0;
      if (liked) {
        await tx.commentLike.create({
          data: { commentId: comment.id, userHash: me.hash },
          select: { commentId: true },
        });
      }
      const updated = await tx.comment.update({
        where: { id: comment.id },
        data: { likeCount: { increment: liked ? 1 : -1 } },
        select: { likeCount: true },
      });
      return { ok: true as const, liked, likeCount: updated.likeCount };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const current = await prisma.comment.findUnique({
        where: { id: comment.id },
        select: { likeCount: true },
      });
      return { ok: true, liked: true, likeCount: current?.likeCount ?? 0 };
    }
    throw e;
  }
}

// ---------------------------------------------------------------- comments

/**
 * Add a comment, or a reply when `parentId` is given.
 * Replies are one level deep: replying to a reply attaches to its top-level parent.
 */
export async function addComment(
  postId: string,
  parentId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isBot(formData)) return { ok: true, nonce: Date.now() };

  const id = idSchema.safeParse(postId);
  if (!id.success) return { error: "Post not found." };
  const parent = parentId === null ? null : idSchema.safeParse(parentId);
  if (parent && !parent.success) return { error: "That comment no longer exists." };

  const parsed = commentSchema.safeParse({ body: field(formData, "body") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { body } = parsed.data;

  if (countLinks(body) > MAX_LINKS) {
    return { error: `Please keep it to ${MAX_LINKS} links or fewer.` };
  }

  const me = await writer();
  if (isDenied(me)) return me;
  if (!(await withinLimit("comment", me))) return deny(429);

  const post = await prisma.post.findFirst({
    where: { id: id.data, hidden: false },
    select: { id: true },
  });
  if (!post) return { error: "This post is no longer available." };

  let topLevelId: string | null = null;
  if (parent) {
    const target = await prisma.comment.findFirst({
      where: { id: parent.data, postId: post.id },
      select: { id: true, parentId: true },
    });
    if (!target) return { error: "That comment no longer exists." };
    topLevelId = target.parentId ?? target.id;
  }

  const [created] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId: post.id,
        parentId: topLevelId,
        body,
        nickname: me.nickname,
        authorHash: me.hash,
      },
      select: { id: true, body: true, nickname: true, likeCount: true, createdAt: true },
    }),
    prisma.post.update({
      where: { id: post.id },
      data: { commentCount: { increment: 1 } },
      select: { id: true },
    }),
  ]);

  const reply: CommentItem | undefined = topLevelId
    ? { ...created, createdAt: created.createdAt.toISOString(), likedByMe: false }
    : undefined;
  return { ok: true, nonce: Date.now(), reply };
}

// ---------------------------------------------------------------- reports

export type ReportResult =
  | { ok: true; message: string; hidden: boolean }
  | { ok: false; error: string; status?: DeniedStatus };

export async function reportContent(input: {
  targetType: "POST" | "COMMENT";
  targetId: string;
  reason?: string;
}): Promise<ReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { targetType, targetId, reason } = parsed.data;

  const me = await writer();
  if (isDenied(me)) return { ok: false, ...me };
  if (!(await withinLimit("report", me))) return { ok: false, ...deny(429) };

  try {
    const hidden = await prisma.$transaction(async (tx) => {
      await tx.report.create({
        data: { targetType, targetId, userHash: me.hash, reason },
        select: { id: true },
      });

      if (targetType === "POST") {
        const post = await tx.post.update({
          where: { id: targetId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true, hidden: true },
        });
        if (!post.hidden && post.reportCount >= HIDE_AFTER_REPORTS) {
          await tx.post.update({
            where: { id: targetId },
            data: { hidden: true },
            select: { id: true },
          });
          return true;
        }
        return post.hidden;
      }

      const comment = await tx.comment.update({
        where: { id: targetId },
        data: { reportCount: { increment: 1 } },
        select: { reportCount: true, hidden: true, postId: true },
      });
      if (!comment.hidden && comment.reportCount >= HIDE_AFTER_REPORTS) {
        await tx.comment.update({
          where: { id: targetId },
          data: { hidden: true },
          select: { id: true },
        });
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 } },
          select: { id: true },
        });
        return true;
      }
      return comment.hidden;
    });

    return {
      ok: true,
      hidden,
      message: hidden
        ? "Thanks. This has been hidden while we take a look."
        : "Thanks for letting us know. We'll take a look.",
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return { ok: true, hidden: false, message: "You've already reported this. Thank you." };
      }
      if (e.code === "P2025") return { ok: false, error: "That content no longer exists." };
    }
    throw e;
  }
}

"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getOrCreateIdentity, hashedIp } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_LINKS,
  commentSchema,
  countLinks,
  firstError,
  idSchema,
  postSchema,
  reportSchema,
} from "@/lib/validation";

export type FormState = { error?: string; ok?: boolean; nonce?: number };

const HIDE_AFTER_REPORTS = 5;
const DUPLICATE_WINDOW_MS = 60 * 60_000;
const SLOW_DOWN = "You're going a bit fast. Have a sip of Ara and try again in a few minutes.";

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

  const me = await getOrCreateIdentity();
  if (!rateLimit("post", me.hash, await hashedIp())) return { error: SLOW_DOWN };

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
  | { ok: false; error: string };

export async function toggleLike(postId: string): Promise<LikeResult> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "Post not found." };

  const me = await getOrCreateIdentity();
  if (!rateLimit("like", me.hash, await hashedIp())) {
    return { ok: false, error: SLOW_DOWN };
  }

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

  const me = await getOrCreateIdentity();
  if (!rateLimit("like", me.hash, await hashedIp())) {
    return { ok: false, error: SLOW_DOWN };
  }

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

// ---------------------------------------------------------------- views

const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|httpclient|okhttp|axios|go-http|java\/|headless|phantom|puppeteer|playwright|lighthouse|pingdom|monitor/i;
const VIEW_RETENTION_DAYS = 2;
const CLEANUP_CHANCE = 0.02;

/** Today's date in UTC, as a @db.Date value. */
function utcDay(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Count a post view once per identity per UTC day.
 * Called from the client after mount, so prerenders and HTML fetchers don't count.
 */
export async function recordView(postId: string): Promise<{ viewCount: number } | null> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return null;

  const ua = (await headers()).get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return null;

  const me = await getOrCreateIdentity();
  if (!rateLimit("view", me.hash, await hashedIp())) return null;

  const post = await prisma.post.findFirst({
    where: { id: id.data, hidden: false },
    select: { id: true, viewCount: true },
  });
  if (!post) return null;

  const now = Date.now();
  const inserted = await prisma.postView.createMany({
    data: [{ postId: post.id, userHash: me.hash, day: utcDay(now) }],
    skipDuplicates: true,
  });

  let viewCount = post.viewCount;
  if (inserted.count > 0) {
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    viewCount = updated.viewCount;
  }

  // Occasionally prune dedupe rows nobody needs anymore.
  if (Math.random() < CLEANUP_CHANCE) {
    await prisma.postView.deleteMany({
      where: { day: { lt: utcDay(now - VIEW_RETENTION_DAYS * 86_400_000) } },
    });
  }

  return { viewCount };
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

  const me = await getOrCreateIdentity();
  if (!rateLimit("comment", me.hash, await hashedIp())) return { error: SLOW_DOWN };

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

  await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId: post.id,
        parentId: topLevelId,
        body,
        nickname: me.nickname,
        authorHash: me.hash,
      },
      select: { id: true },
    }),
    prisma.post.update({
      where: { id: post.id },
      data: { commentCount: { increment: 1 } },
      select: { id: true },
    }),
  ]);

  return { ok: true, nonce: Date.now() };
}

// ---------------------------------------------------------------- reports

export type ReportResult =
  | { ok: true; message: string; hidden: boolean }
  | { ok: false; error: string };

export async function reportContent(input: {
  targetType: "POST" | "COMMENT";
  targetId: string;
  reason?: string;
}): Promise<ReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { targetType, targetId, reason } = parsed.data;

  const me = await getOrCreateIdentity();
  if (!rateLimit("report", me.hash, await hashedIp())) {
    return { ok: false, error: SLOW_DOWN };
  }

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

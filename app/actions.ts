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
  // Independent checks, one round trip.
  const [allowed, duplicate] = await Promise.all([
    withinLimit("post", me),
    prisma.post.findFirst({
      where: { title, body, createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
      select: { id: true },
    }),
  ]);
  if (!allowed) return deny(429);
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
  // Independent checks, one round trip.
  const [allowed, post] = await Promise.all([
    withinLimit("like", me),
    prisma.post.findFirst({ where: { id: id.data, hidden: false }, select: { id: true } }),
  ]);
  if (!allowed) return { ok: false, ...deny(429) };
  if (!post) return { ok: false, error: "Post not found." };

  // Toggle in one atomic statement: remove the like if it exists, otherwise add
  // it, and move the counter by the same amount.
  const [r] = await prisma.$queryRaw<{ deleted: number; likeCount: number }[]>`
    WITH del AS (
      DELETE FROM "Like" WHERE "postId" = ${post.id} AND "userHash" = ${me.hash} RETURNING 1
    ), ins AS (
      INSERT INTO "Like" ("postId", "userHash")
      SELECT ${post.id}, ${me.hash} WHERE NOT EXISTS (SELECT 1 FROM del)
      ON CONFLICT DO NOTHING RETURNING 1
    ), upd AS (
      UPDATE "Post" SET "likeCount" = "likeCount" + (SELECT count(*) FROM ins) - (SELECT count(*) FROM del)
      WHERE "id" = ${post.id} RETURNING "likeCount"
    )
    SELECT (SELECT count(*) FROM del)::int AS "deleted", (SELECT "likeCount" FROM upd) AS "likeCount"`;
  // A concurrent tap may have added it first (insert skipped): it is liked either way.
  return { ok: true, liked: r.deleted === 0, likeCount: r.likeCount };
}

/** Like/unlike a comment or reply. Shares the post like rate limit. */
export async function toggleCommentLike(commentId: string): Promise<LikeResult> {
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { ok: false, error: "Comment not found." };

  const me = await writer();
  if (isDenied(me)) return { ok: false, ...me };
  const [allowed, comment] = await Promise.all([
    withinLimit("like", me),
    prisma.comment.findFirst({
      where: { id: id.data, hidden: false, post: { hidden: false } },
      select: { id: true },
    }),
  ]);
  if (!allowed) return { ok: false, ...deny(429) };
  if (!comment) return { ok: false, error: "Comment not found." };

  const [r] = await prisma.$queryRaw<{ deleted: number; likeCount: number }[]>`
    WITH del AS (
      DELETE FROM "CommentLike" WHERE "commentId" = ${comment.id} AND "userHash" = ${me.hash} RETURNING 1
    ), ins AS (
      INSERT INTO "CommentLike" ("commentId", "userHash")
      SELECT ${comment.id}, ${me.hash} WHERE NOT EXISTS (SELECT 1 FROM del)
      ON CONFLICT DO NOTHING RETURNING 1
    ), upd AS (
      UPDATE "Comment" SET "likeCount" = "likeCount" + (SELECT count(*) FROM ins) - (SELECT count(*) FROM del)
      WHERE "id" = ${comment.id} RETURNING "likeCount"
    )
    SELECT (SELECT count(*) FROM del)::int AS "deleted", (SELECT "likeCount" FROM upd) AS "likeCount"`;
  return { ok: true, liked: r.deleted === 0, likeCount: r.likeCount };
}

// ---------------------------------------------------------------- shares

export type ShareResult =
  | { ok: true; shareCount: number; counted: boolean }
  | { ok: false; error: string; status?: DeniedStatus };

/**
 * Record that this browser shared a post (native share completed, a share
 * target was tapped, or the link was copied). Counts once per browser per post.
 * Same guards as likes: real browser with the anonymous cookie, rate limited.
 */
export async function recordShare(postId: string): Promise<ShareResult> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "Post not found." };

  const me = await writer();
  if (isDenied(me)) return { ok: false, ...me };
  const [allowed, post] = await Promise.all([
    withinLimit("share", me),
    prisma.post.findFirst({ where: { id: id.data, hidden: false }, select: { id: true } }),
  ]);
  if (!allowed) return { ok: false, ...deny(429) };
  if (!post) return { ok: false, error: "Post not found." };

  // Unique (postId, userHash): a repeat share by the same browser is skipped,
  // and the counter only moves when a row was added. One statement.
  const [r] = await prisma.$queryRaw<{ counted: number; shareCount: number }[]>`
    WITH ins AS (
      INSERT INTO "PostShare" ("postId", "userHash") VALUES (${post.id}, ${me.hash})
      ON CONFLICT DO NOTHING RETURNING 1
    ), upd AS (
      UPDATE "Post" SET "shareCount" = "shareCount" + (SELECT count(*) FROM ins)
      WHERE "id" = ${post.id} RETURNING "shareCount"
    )
    SELECT (SELECT count(*) FROM ins)::int AS "counted", (SELECT "shareCount" FROM upd) AS "shareCount"`;
  return { ok: true, shareCount: r.shareCount, counted: r.counted > 0 };
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
  // Independent checks, one round trip.
  const [allowed, post, target] = await Promise.all([
    withinLimit("comment", me),
    prisma.post.findFirst({ where: { id: id.data, hidden: false }, select: { id: true } }),
    parent
      ? prisma.comment.findFirst({
          where: { id: parent.data, postId: id.data },
          select: { id: true, parentId: true },
        })
      : null,
  ]);
  if (!allowed) return deny(429);
  if (!post) return { error: "This post is no longer available." };
  if (parent && !target) return { error: "That comment no longer exists." };
  const topLevelId = target ? (target.parentId ?? target.id) : null;

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

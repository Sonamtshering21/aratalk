"use client";

import { useState } from "react";
import type { CommentItem, RepliesPage, ThreadItem } from "@/lib/comment-types";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { LikeButton } from "./LikeButton";
import { ReportButton } from "./ReportButton";
import { ReplyIcon } from "./icons";

type ReplyTarget = { id: string; nickname: string };

const byTime = (a: CommentItem, b: CommentItem) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);

/** Merge reply lists, newest data winning, oldest first. */
function mergeReplies(...lists: CommentItem[][]): CommentItem[] {
  const map = new Map<string, CommentItem>();
  for (const list of lists) for (const r of list) map.set(r.id, r);
  return [...map.values()].sort(byTime);
}

export function CommentThread({
  postId,
  thread,
  now,
}: {
  postId: string;
  thread: ThreadItem;
  now: number;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Replies loaded with "View more", and replies this browser just posted.
  const [loaded, setLoaded] = useState<CommentItem[]>([]);
  const [own, setOwn] = useState<CommentItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const { comment } = thread;
  const replies = mergeReplies(own, thread.replies, loaded);
  const nextCursor = cursor === undefined ? thread.repliesCursor : cursor;
  const remaining = Math.max(0, thread.replyCount - replies.length);

  async function loadMore() {
    if (!nextCursor || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/comments/${thread.id}/replies?cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as RepliesPage;
      setLoaded((prev) => mergeReplies(prev, page.replies));
      setCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  const replyBox = (target: ReplyTarget) =>
    replyTo?.id === target.id && (
      // No avatar-indent on phones so the box keeps enough width inside replies.
      <div className="pb-2 sm:pl-10.5">
        <CommentForm
          // The server attaches replies-to-replies to the top-level comment.
          postId={postId}
          parentId={target.id}
          replyingTo={target.nickname}
          onCancel={() => setReplyTo(null)}
          onDone={(reply) => {
            setReplyTo(null);
            if (reply) setOwn((prev) => mergeReplies(prev, [reply]));
          }}
        />
      </div>
    );

  return (
    <li className="min-w-0 rounded-card bg-card px-4 pt-4 pb-1 shadow-card">
      {comment ? (
        <>
          <CommentRow comment={comment} now={now} onReply={() => setReplyTo(comment)} />
          {replyBox(comment)}
        </>
      ) : (
        <p className="flex min-h-11 items-center gap-2 pb-3 text-sm text-ink-soft italic">
          <span aria-hidden="true">🙈</span> This comment was hidden
        </p>
      )}

      {replies.length > 0 && (
        <div className="mt-1 mb-3 ml-3 border-l-2 border-gold/45 pl-3 sm:ml-4 sm:pl-4">
          <ol className="space-y-1" aria-label="Replies">
            {replies.map((reply) => (
              <li key={reply.id} className="min-w-0 pt-2">
                <CommentRow comment={reply} now={now} onReply={() => setReplyTo(reply)} />
                {replyBox(reply)}
              </li>
            ))}
          </ol>
          {nextCursor && remaining > 0 && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={status === "loading"}
              className="mt-1 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-gold-deep transition hover:bg-gold-soft active:scale-95 disabled:opacity-60"
            >
              {status === "loading"
                ? "Loading…"
                : status === "error"
                  ? "Couldn't load replies. Try again"
                  : `View ${remaining} more ${remaining === 1 ? "reply" : "replies"}`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CommentRow({
  comment,
  now,
  onReply,
}: {
  comment: CommentItem;
  now: number;
  onReply: () => void;
}) {
  return (
    <article className="min-w-0">
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <Avatar nickname={comment.nickname} />
        <span className="min-w-0 truncate font-bold text-espresso">{comment.nickname}</span>
        <span className="text-ink-soft" aria-hidden="true">·</span>
        <time dateTime={comment.createdAt} className="shrink-0 text-ink-soft">
          {timeAgo(new Date(comment.createdAt), now)}
        </time>
      </div>
      <p className="mt-1.5 pl-10.5 leading-relaxed wrap-anywhere whitespace-pre-wrap text-ink">
        {comment.body}
      </p>
      <div className="-ml-3 flex flex-wrap items-center pl-10.5">
        <LikeButton
          id={comment.id}
          target="comment"
          initialLiked={comment.likedByMe}
          initialCount={comment.likeCount}
          size="xs"
        />
        <button
          type="button"
          onClick={onReply}
          aria-label={`Reply to ${comment.nickname}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-ink-soft transition hover:bg-cream hover:text-espresso active:scale-95"
        >
          <ReplyIcon size={16} /> Reply
        </button>
        <ReportButton targetType="COMMENT" targetId={comment.id} />
      </div>
    </article>
  );
}

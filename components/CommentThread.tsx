"use client";

import { useState } from "react";
import type { CommentView, ThreadView } from "@/lib/queries";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { LikeButton } from "./LikeButton";
import { ReportButton } from "./ReportButton";
import { ReplyIcon } from "./icons";

const VISIBLE_REPLIES = 3;

type ReplyTarget = { id: string; nickname: string };

export function CommentThread({
  postId,
  thread,
  now,
}: {
  postId: string;
  thread: ThreadView;
  now: number;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { comment, replies } = thread;
  const hiddenCount = replies.length - VISIBLE_REPLIES;
  const shown = expanded || hiddenCount <= 0 ? replies : replies.slice(0, VISIBLE_REPLIES);

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
          onDone={() => {
            setReplyTo(null);
            setExpanded(true);
          }}
        />
      </div>
    );

  return (
    <li className="min-w-0 rounded-card bg-card px-4 pt-4 pb-1 shadow-card">
      {comment ? (
        <>
          <CommentItem comment={comment} now={now} onReply={() => setReplyTo(comment)} />
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
            {shown.map((reply) => (
              <li key={reply.id} className="min-w-0 pt-2">
                <CommentItem comment={reply} now={now} onReply={() => setReplyTo(reply)} />
                {replyBox(reply)}
              </li>
            ))}
          </ol>
          {!expanded && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-1 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-gold-deep transition hover:bg-gold-soft active:scale-95"
            >
              View {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CommentItem({
  comment,
  now,
  onReply,
}: {
  comment: CommentView;
  now: number;
  onReply: () => void;
}) {
  return (
    <article className="min-w-0">
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <Avatar nickname={comment.nickname} />
        <span className="min-w-0 truncate font-bold text-espresso">{comment.nickname}</span>
        <span className="text-ink-soft" aria-hidden="true">·</span>
        <time dateTime={comment.createdAt.toISOString()} className="shrink-0 text-ink-soft">
          {timeAgo(comment.createdAt, now)}
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

import type { CommentView } from "@/lib/queries";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { ReportButton } from "./ReportButton";

export function CommentList({ comments, now }: { comments: CommentView[]; now: number }) {
  if (comments.length === 0) {
    return (
      <EmptyState emoji="💬" title="No comments yet">
        <p>Pour a cup and be the first to reply.</p>
      </EmptyState>
    );
  }

  return (
    <ol className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className="rounded-card bg-card px-4 pt-4 pb-1 shadow-card">
          <div className="flex items-center gap-2.5 text-sm">
            <Avatar nickname={c.nickname} />
            <span className="min-w-0 truncate font-bold text-espresso">{c.nickname}</span>
            <span className="text-ink-soft" aria-hidden="true">·</span>
            <time dateTime={c.createdAt.toISOString()} className="shrink-0 text-ink-soft">
              {timeAgo(c.createdAt, now)}
            </time>
          </div>
          <p className="mt-2 pl-10.5 leading-relaxed break-words whitespace-pre-wrap text-ink">
            {c.body}
          </p>
          <div className="-ml-3 pl-10.5">
            <ReportButton targetType="COMMENT" targetId={c.id} />
          </div>
        </li>
      ))}
    </ol>
  );
}

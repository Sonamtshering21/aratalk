import type { ThreadView } from "@/lib/queries";
import { CommentThread } from "./CommentThread";
import { EmptyState } from "./EmptyState";

export function CommentList({
  postId,
  threads,
  now,
}: {
  postId: string;
  threads: ThreadView[];
  now: number;
}) {
  if (threads.length === 0) {
    return (
      <EmptyState emoji="💬" title="No comments yet">
        <p>Pour a cup and be the first to reply.</p>
      </EmptyState>
    );
  }

  return (
    <ol className="space-y-3">
      {threads.map((thread) => (
        <CommentThread key={thread.id} postId={postId} thread={thread} now={now} />
      ))}
    </ol>
  );
}

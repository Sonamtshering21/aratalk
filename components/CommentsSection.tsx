"use client";

import { useState } from "react";
import type { ThreadItem, ThreadsPage } from "@/lib/comment-types";
import { CommentThread } from "./CommentThread";
import { EmptyState } from "./EmptyState";

const byNewest = (a: ThreadItem, b: ThreadItem) =>
  a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt);

/**
 * Top-level comments, 20 per page (newest first) with a "Load more" button.
 * After a new comment, the page re-renders with a fresh first page; threads the
 * reader already loaded further down are kept rather than thrown away.
 */
export function CommentsSection({
  postId,
  initial,
  now,
}: {
  postId: string;
  initial: ThreadsPage;
  now: number;
}) {
  const [loaded, setLoaded] = useState<ThreadItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [prevInitial, setPrevInitial] = useState(initial);

  // A refresh (e.g. after posting) brings a new first page. If the reader had
  // loaded more, keep the old first page too so nothing slips between pages.
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    if (loaded.length > 0) setLoaded((prev) => [...prevInitial.threads, ...prev]);
  }

  const seen = new Set(initial.threads.map((t) => t.id));
  const extra = loaded
    .filter((t, i, all) => !seen.has(t.id) && all.findIndex((x) => x.id === t.id) === i)
    .sort(byNewest);
  const ordered = [...initial.threads, ...extra];
  const nextCursor = cursor === undefined ? initial.nextCursor : cursor;

  async function loadMore() {
    if (!nextCursor || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/posts/${postId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as ThreadsPage;
      setLoaded((prev) => [...prev.filter((t) => !page.threads.some((p) => p.id === t.id)), ...page.threads]);
      setCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  if (ordered.length === 0) {
    return (
      <EmptyState emoji="💬" title="No comments yet">
        <p>Pour a cup and be the first to reply.</p>
      </EmptyState>
    );
  }

  return (
    <>
      <ol className="space-y-3">
        {ordered.map((thread) => (
          <CommentThread key={thread.id} postId={postId} thread={thread} now={now} />
        ))}
      </ol>
      <div className="mt-5 flex flex-col items-center gap-2 text-center">
        {status === "error" && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            Couldn&apos;t load more comments. Check your connection and try again.
          </p>
        )}
        {nextCursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={status === "loading"}
            className="min-h-11 rounded-full border border-espresso/15 bg-card px-6 text-sm font-bold text-espresso shadow-sm transition hover:border-gold hover:text-gold-deep active:scale-95 disabled:opacity-60"
          >
            {status === "loading" ? "Loading…" : status === "error" ? "Try again" : "Load more comments"}
          </button>
        )}
      </div>
    </>
  );
}

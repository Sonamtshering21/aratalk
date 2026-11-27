"use client";

import { useEffect } from "react";
import { flushViews, trackView } from "@/lib/view-queue";
import { ViewCount } from "./ViewCount";

/**
 * Post page: opening the discussion counts as a view, sent right away.
 * It shares the feed's queue, so a browser never counts the same post twice.
 */
export function ViewCounter({ postId, initialCount }: { postId: string; initialCount: number }) {
  useEffect(() => {
    trackView(postId);
    void flushViews();
  }, [postId]);

  return <ViewCount postId={postId} initial={initialCount} size="md" />;
}

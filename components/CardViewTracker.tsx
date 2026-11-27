"use client";

import { useEffect, useRef } from "react";
import { hasViewed, startViewQueue, trackView } from "@/lib/view-queue";

const VISIBLE_RATIO = 0.5;
const DWELL_MS = 2000;

/**
 * Invisible overlay that fills its (relative) parent card. Counts a view once the
 * card has been at least 50% on screen for 2 seconds; scrolling past resets the timer.
 */
export function CardViewTracker({ postId }: { postId: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    startViewQueue();
    const el = ref.current;
    if (!el || hasViewed(postId) || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          if (timer === null) {
            timer = setTimeout(() => {
              timer = null;
              // A backgrounded tab doesn't count as reading.
              if (document.visibilityState !== "visible") return;
              trackView(postId);
              io.disconnect();
            }, DWELL_MS);
          }
        } else {
          stop();
        }
      },
      { threshold: [0, VISIBLE_RATIO] },
    );
    io.observe(el);
    return () => {
      stop();
      io.disconnect();
    };
  }, [postId]);

  return <span ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0" />;
}

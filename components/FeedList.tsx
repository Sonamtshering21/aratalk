"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPage, FeedPost, FeedTab, TopRange } from "@/lib/feed-types";
import { EmptyState } from "./EmptyState";
import { useFeedNav } from "./FeedNav";
import { PostCard } from "./PostCard";
import { FeedSkeleton, PostCardSkeleton } from "./Skeletons";

const NEW_POSTS_POLL_MS = 60_000;

type Status = "idle" | "loading" | "error";

const EMPTY_TEXT: Record<FeedTab, { title: string; body: string }> = {
  latest: { title: "It's quiet around the fire", body: "No one has spoken up yet." },
  trending: { title: "Nothing's trending yet", body: "Conversations from the last 30 days show up here." },
  top: { title: "No top posts in this range", body: "Try a longer time range, or start something worth talking about." },
};

export function FeedList({
  tab,
  range,
  initial,
}: {
  tab: FeedTab;
  range: TopRange;
  initial: FeedPage;
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initial.posts);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [now, setNow] = useState(initial.readAt);
  const [status, setStatus] = useState<Status>("idle");
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true;
    setStatus("loading");
    try {
      const qs = new URLSearchParams({ tab, range, cursor });
      const res = await fetch(`/api/feed?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as FeedPage;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(page.nextCursor);
      setNow(page.readAt);
      setStatus("idle");
    } catch {
      setStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, [cursor, tab, range]);

  // Fetch the next page when the sentinel comes within ~1.5 screens.
  // Re-created per cursor, so a still-visible sentinel triggers the next page.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  // Keep the scroll position when going to a post and pressing back.
  // Next.js keeps this route mounted but hidden (Activity) and re-runs effects
  // when it becomes visible again, so restore the last position seen here.
  const lastY = useRef(0);
  useEffect(() => {
    const saved = lastY.current;
    if (saved > 0) requestAnimationFrame(() => window.scrollTo(0, saved));
    const onScroll = () => {
      lastY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Switching tab/range: show skeletons right away instead of the old list.
  const nav = useFeedNav();
  if (nav?.pending) return <FeedSkeleton />;

  if (posts.length === 0 && !cursor) {
    const text = EMPTY_TEXT[tab];
    return (
      <EmptyState emoji="🫖" title={text.title}>
        <p>
          {text.body}{" "}
          <Link href="/new" className="font-bold text-gold-deep underline underline-offset-2">
            Start a conversation
          </Link>
          .
        </p>
      </EmptyState>
    );
  }

  return (
    <div
      // Record the position at tap time too, before navigation scrolls the page.
      onClickCapture={() => {
        lastY.current = window.scrollY;
      }}
    >
      <NewPostsPill since={initial.readAt} />

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} now={now} />
        ))}
        {status === "loading" && (
          <div className="space-y-4" role="status" aria-label="Loading more posts">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        )}
      </div>

      <div ref={sentinel} aria-hidden="true" className="h-px" />

      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        {status === "error" && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            Couldn&apos;t load more posts. Check your connection and try again.
          </p>
        )}
        {cursor && status !== "loading" && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="min-h-11 rounded-full border border-espresso/15 bg-card px-6 text-sm font-bold text-espresso shadow-sm transition hover:border-gold hover:text-gold-deep active:scale-95"
          >
            {status === "error" ? "Try again" : "Load more"}
          </button>
        )}
        {!cursor && (
          <p className="py-4 font-bold text-ink-soft">You&apos;ve reached the end 🍶</p>
        )}
      </div>
    </div>
  );
}

/** Polls a cheap count endpoint and offers a refresh when newer posts exist. */
function NewPostsPill({ since }: { since: number }) {
  const [count, setCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/feed/new?since=${since}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (active) setCount(data.count);
      } catch {
        // Offline or server busy: try again next tick.
      }
    };
    const timer = setInterval(check, NEW_POSTS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [since]);

  if (count === 0) return null;

  return (
    <div className="pointer-events-none sticky top-20 z-20 -mt-2 mb-3 flex justify-center">
      <button
        type="button"
        onClick={() => {
          setCount(0);
          window.scrollTo({ top: 0, behavior: "smooth" });
          router.refresh();
        }}
        className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-espresso px-5 text-sm font-bold text-cream shadow-card-hover transition hover:bg-espresso-soft active:scale-95"
      >
        <span aria-hidden="true">↑</span>
        {count === 1 ? "1 new post" : `${count > 99 ? "99+" : count} new posts`}: tap to refresh
      </button>
    </div>
  );
}

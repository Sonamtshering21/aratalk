"use client";

import { useState, useTransition } from "react";
import { toggleCommentLike, toggleLike } from "@/app/actions";
import { HeartIcon } from "./icons";

type Props = {
  /** Post id, or comment id when `target` is "comment". */
  id: string;
  target?: "post" | "comment";
  initialLiked: boolean;
  initialCount: number;
  size?: "xs" | "sm" | "md";
};

export function LikeButton({
  id,
  target = "post",
  initialLiked,
  initialCount,
  size = "sm",
}: Props) {
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const [server, setServer] = useState({ liked: initialLiked, count: initialCount });
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const [, startTransition] = useTransition();

  // Adopt fresh server values when the page re-renders with new data.
  if (server.liked !== initialLiked || server.count !== initialCount) {
    setServer({ liked: initialLiked, count: initialCount });
    setState({ liked: initialLiked, count: initialCount });
  }

  function onClick() {
    const previous = state;
    const next = {
      liked: !previous.liked,
      count: Math.max(0, previous.count + (previous.liked ? -1 : 1)),
    };
    setState(next); // optimistic
    setError(null);
    if (next.liked) setBump((b) => b + 1);

    startTransition(async () => {
      try {
        const result = await (target === "comment" ? toggleCommentLike(id) : toggleLike(id));
        if (result.ok) {
          setState({ liked: result.liked, count: result.likeCount });
        } else {
          setState(previous);
          setError(result.error);
        }
      } catch {
        setState(previous);
        setError("Couldn't save your like. Please try again.");
      }
    });
  }

  const md = size === "md";
  const xs = size === "xs";

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={state.liked}
        aria-label={`${state.liked ? "Unlike" : "Like"} this ${target}`}
        title={error ?? undefined}
        className={`relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 font-bold transition active:scale-95 ${
          md ? "text-base" : xs ? "text-xs" : "text-sm"
        } ${
          state.liked
            ? "bg-gold-soft text-gold-deep"
            : "text-ink-soft hover:bg-cream hover:text-espresso"
        }`}
      >
        <HeartIcon
          key={bump}
          filled={state.liked}
          size={md ? 22 : xs ? 16 : 19}
          className={bump > 0 && state.liked ? "animate-pop" : undefined}
        />
        <span className="tabular-nums">{state.count}</span>
      </button>
      {error && (
        <span
          role="alert"
          className="absolute top-full left-0 z-20 mt-1 w-56 rounded-xl bg-espresso px-3 py-2 text-xs font-semibold text-cream shadow-lg"
        >
          {error}
        </span>
      )}
    </span>
  );
}

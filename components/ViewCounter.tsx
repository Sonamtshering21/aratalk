"use client";

import { startTransition, useEffect, useState } from "react";
import { recordView } from "@/app/actions";
import { formatCount } from "@/lib/format";
import { EyeIcon } from "./icons";

// One call per post per page session. The server also dedupes per identity per
// day, but this avoids repeat calls when Activity re-runs effects on back/forward.
const recorded = new Set<string>();

export function ViewCounter({ postId, initialCount }: { postId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (recorded.has(postId)) return;
    recorded.add(postId);
    startTransition(async () => {
      try {
        const result = await recordView(postId);
        if (result) setCount(result.viewCount);
      } catch {
        // A missed view isn't worth bothering the reader about.
      }
    });
  }, [postId]);

  return (
    <span
      className="inline-flex min-h-11 items-center gap-1.5 px-3 font-semibold text-ink-soft"
      title={`${count.toLocaleString("en")} views`}
    >
      <EyeIcon size={21} />
      <span className="tabular-nums">{formatCount(count)}</span>
      <span className="sr-only">views</span>
    </span>
  );
}

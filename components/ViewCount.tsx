"use client";

import { useSyncExternalStore } from "react";
import { formatCount } from "@/lib/format";
import { getCount, subscribeCounts } from "@/lib/view-queue";
import { EyeIcon } from "./icons";

/** View count that updates live when the browser's view batch is answered. */
export function ViewCount({
  postId,
  initial,
  size = "sm",
}: {
  postId: string;
  initial: number;
  size?: "sm" | "md";
}) {
  const live = useSyncExternalStore(
    subscribeCounts,
    () => getCount(postId),
    () => undefined,
  );
  // The server render may be newer than an older live value, or vice versa.
  const count = Math.max(initial, live ?? 0);
  const md = size === "md";

  return (
    <span
      className={`inline-flex min-h-11 items-center gap-1.5 font-semibold text-ink-soft ${
        md ? "px-3" : "px-1 text-sm text-ink-soft/90"
      }`}
      title={`${count.toLocaleString("en")} views`}
    >
      <EyeIcon size={md ? 21 : 18} />
      <span className="tabular-nums">{formatCount(count)}</span>
      <span className="sr-only">views</span>
    </span>
  );
}

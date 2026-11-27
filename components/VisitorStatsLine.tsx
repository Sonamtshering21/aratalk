"use client";

import { useSyncExternalStore } from "react";
import { formatCount } from "@/lib/format";
import { getLiveStats, subscribeLiveStats } from "@/lib/stats-store";
import type { VisitorStats } from "@/lib/visitor-stats";

/** "🟢 12 reading now · 👀 1.2K visitors this month", updated by the heartbeat. */
export function VisitorStatsLine({ initial }: { initial: VisitorStats }) {
  const live = useSyncExternalStore(subscribeLiveStats, getLiveStats, () => null);
  const stats = live ?? initial;
  // You are reading too, even before your first heartbeat is counted.
  const reading = Math.max(1, stats.readingNow);
  const visitors = Math.max(reading, stats.visitorsThisMonth);

  return (
    <p className="mb-4 flex items-center gap-1.5 overflow-hidden text-xs font-semibold whitespace-nowrap text-ink-soft max-[359px]:text-[11px]">
      <span aria-hidden="true">🟢</span>
      <span>
        <span className="tabular-nums">{formatCount(reading)}</span> reading now
      </span>
      <span aria-hidden="true">·</span>
      <span aria-hidden="true">👀</span>
      <span>
        <span className="tabular-nums">{formatCount(visitors)}</span>{" "}
        {visitors === 1 ? "visitor" : "visitors"} this month
      </span>
    </p>
  );
}

/** Same height while the numbers load, so nothing jumps. */
export function VisitorStatsPlaceholder() {
  return <p aria-hidden="true" className="mb-4 h-4 text-xs max-[359px]:text-[11px]" />;
}

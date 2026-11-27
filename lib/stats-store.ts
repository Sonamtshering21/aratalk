// Browser-only: latest visitor stats from heartbeat responses.
import type { VisitorStats } from "./visitor-stats";

let latest: VisitorStats | null = null;
const listeners = new Set<() => void>();

export function setLiveStats(next: VisitorStats) {
  if (latest && latest.readingNow === next.readingNow && latest.visitorsThisMonth === next.visitorsThisMonth) return;
  latest = next;
  for (const fn of listeners) fn();
}

export function subscribeLiveStats(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const getLiveStats = () => latest;

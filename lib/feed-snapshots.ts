import { randomUUID } from "node:crypto";

// Ranked feeds (Trending/Top) change while someone scrolls: likes come in and
// trending scores decay. To page through them without duplicates or skipped
// posts, the first page freezes the ranked list of post ids here, and later
// pages walk that frozen list by offset.
//
// In-memory and per-process, like the rate limiter. If a snapshot expires
// (20 minutes idle) or the server restarts, the next page re-ranks and the
// client drops any ids it already shows.

type Snapshot = { ids: string[]; expiresAt: number };

const TTL_MS = 20 * 60_000;
const MAX_SNAPSHOTS = 1000;

const globalForSnapshots = globalThis as unknown as {
  feedSnapshots?: Map<string, Snapshot>;
};
const snapshots = (globalForSnapshots.feedSnapshots ??= new Map<string, Snapshot>());

export function saveSnapshot(ids: string[], now: number): string {
  if (snapshots.size >= MAX_SNAPSHOTS) {
    for (const [key, snap] of snapshots) {
      if (snap.expiresAt <= now) snapshots.delete(key);
    }
    // Still full: drop the oldest (Map keeps insertion order).
    while (snapshots.size >= MAX_SNAPSHOTS) {
      const oldest = snapshots.keys().next().value;
      if (oldest === undefined) break;
      snapshots.delete(oldest);
    }
  }
  const id = randomUUID();
  snapshots.set(id, { ids, expiresAt: now + TTL_MS });
  return id;
}

/** Returns the frozen id list and extends its lifetime, or null if gone. */
export function readSnapshot(id: string, now: number): string[] | null {
  const snap = snapshots.get(id);
  if (!snap) return null;
  if (snap.expiresAt <= now) {
    snapshots.delete(id);
    return null;
  }
  snap.expiresAt = now + TTL_MS;
  return snap.ids;
}

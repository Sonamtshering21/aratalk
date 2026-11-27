// Browser-only view batching. Import from client components only.
//
// - trackView(id): remember a post as viewed and queue it for the server.
// - Queued ids are sent together about every 10 s (at most one request per
//   10.5 s, matching the server's 1 batch / 10 s limit, across page loads),
//   immediately via flushViews() when allowed, or with navigator.sendBeacon
//   when the page is hidden or closed.
// - If the page is hidden too soon after a send, the queue is saved and sent
//   on the next visit instead of being rejected.
// - Ids the server has accepted are kept in localStorage so this browser
//   never sends them again.
// - The latest counts from the server are kept here so cards and the post
//   page can show them without a reload (see ViewCount).

const SENT_KEY = "aratalk:viewed:v1";
const LAST_SENT_KEY = "aratalk:views:last";
const PENDING_KEY = "aratalk:views:pending";
const MAX_REMEMBERED = 3000;
const BATCH_DELAY_MS = 10_000;
const MIN_GAP_MS = 10_500;
const ENDPOINT = "/api/views";
const MAX_BATCH = 50;

let sent: Set<string> | null = null; // accepted by the server (persisted)
const pending = new Set<string>(); // waiting to be sent
const inFlight = new Set<string>(); // being sent right now
const counts = new Map<string, number>();
const listeners = new Set<() => void>();
let started = false;
let scheduled: ReturnType<typeof setTimeout> | null = null;
let lastSentMemory = 0;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode or blocked storage
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable: the server still dedupes.
  }
}

function loadSent(): Set<string> {
  if (sent) return sent;
  sent = new Set();
  try {
    const ids = JSON.parse(read(SENT_KEY) ?? "[]") as unknown;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") sent.add(id);
  } catch {
    // Corrupt value: start fresh.
  }
  return sent;
}

function remember(ids: Iterable<string>) {
  const set = loadSent();
  for (const id of ids) {
    set.delete(id); // re-insert so the newest stay when trimming
    set.add(id);
  }
  while (set.size > MAX_REMEMBERED) set.delete(set.values().next().value as string);
  write(SENT_KEY, JSON.stringify([...set]));
}

function lastSentAt(): number {
  return Math.max(lastSentMemory, Number(read(LAST_SENT_KEY)) || 0);
}
function markSent(at: number) {
  lastSentMemory = at;
  write(LAST_SENT_KEY, String(at));
}
/** How long until another request is allowed. */
function waitMs(): number {
  return Math.max(0, lastSentAt() + MIN_GAP_MS - Date.now());
}

function schedule(ms: number) {
  if (scheduled !== null) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    void flushViews();
  }, ms);
}

/** True if this browser already counted (or is counting) a view of this post. */
export function hasViewed(postId: string): boolean {
  return loadSent().has(postId) || pending.has(postId) || inFlight.has(postId);
}

export function trackView(postId: string): void {
  startViewQueue();
  if (hasViewed(postId)) return;
  pending.add(postId);
  schedule(Math.max(BATCH_DELAY_MS, waitMs()));
}

function takeBatch(): string[] {
  const batch = [...pending].slice(0, MAX_BATCH);
  for (const id of batch) pending.delete(id);
  return batch;
}

/** Send queued views now if allowed, otherwise as soon as the 10 s gap has passed. */
export async function flushViews(): Promise<void> {
  if (pending.size === 0 || inFlight.size > 0) return;
  const wait = waitMs();
  if (wait > 0) {
    schedule(wait);
    return;
  }
  const batch = takeBatch();
  for (const id of batch) inFlight.add(id);
  markSent(Date.now());
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ ids: batch }),
      keepalive: true,
    });
    if (res.ok) {
      const data = (await res.json()) as { counts?: Record<string, number> };
      remember(batch);
      setCounts(data.counts ?? {});
    } else if (res.status === 429 || res.status >= 500) {
      for (const id of batch) pending.add(id); // try again after the gap
    } else if (res.status !== 401) {
      remember(batch); // rejected for good (e.g. invalid id): don't retry
    }
    // 401 = no browser cookie (cookies blocked): drop quietly.
  } catch {
    for (const id of batch) pending.add(id); // offline: retry later
  } finally {
    for (const id of batch) inFlight.delete(id);
  }
  if (pending.size > 0) schedule(MIN_GAP_MS);
}

/** Last chance when the page is hidden or closed. No response is read. */
function onHide() {
  if (pending.size === 0) return;
  if (waitMs() === 0 && typeof navigator.sendBeacon === "function") {
    const batch = takeBatch();
    const blob = new Blob([JSON.stringify({ ids: batch })], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon(ENDPOINT, blob)) {
      markSent(Date.now());
      remember(batch);
    } else {
      for (const id of batch) pending.add(id);
    }
  }
  // Whatever couldn't go now (too soon after the last send, or more than one
  // batch) is saved and sent on the next visit.
  write(PENDING_KEY, pending.size > 0 ? JSON.stringify([...pending]) : null);
}

/** Set up listeners and pick up views saved by a previous visit. Idempotent. */
export function startViewQueue(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const saved = JSON.parse(read(PENDING_KEY) ?? "[]") as unknown;
    if (Array.isArray(saved)) {
      for (const id of saved) if (typeof id === "string" && !loadSent().has(id)) pending.add(id);
    }
  } catch {
    // Corrupt value: ignore.
  }
  write(PENDING_KEY, null);
  if (pending.size > 0) schedule(waitMs());
  // iOS Safari often skips unload events; visibilitychange is the reliable one.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
  window.addEventListener("pagehide", onHide);
}

// ---------------------------------------------------------------- counts

function setCounts(next: Record<string, number>) {
  let changed = false;
  for (const [id, n] of Object.entries(next)) {
    if (counts.get(id) !== n) {
      counts.set(id, n);
      changed = true;
    }
  }
  if (changed) for (const fn of listeners) fn();
}

export function subscribeCounts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCount(postId: string): number | undefined {
  return counts.get(postId);
}

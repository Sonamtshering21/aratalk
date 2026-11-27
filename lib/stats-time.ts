// Dependency-free helpers for visitor stats (also used by tests).

/** Bhutan Time is UTC+6 all year (no daylight saving). */
const BHUTAN_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Calendar month in Bhutan for a UTC timestamp, e.g. "2026-11". */
export function bhutanMonth(ms: number): string {
  return new Date(ms + BHUTAN_OFFSET_MS).toISOString().slice(0, 7);
}

/** The Bhutan month before `month` ("2026-01" → "2025-12"). */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** A browser counts as "reading now" if it sent a heartbeat this recently. */
export const READING_WINDOW_MS = 150_000; // heartbeats every ~60 s, so 2½ missed-beat margin
/** The browser sends a heartbeat this often while the tab is visible. */
export const HEARTBEAT_EVERY_MS = 60_000;

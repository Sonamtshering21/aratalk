"use client";

import { useEffect } from "react";
import { HEARTBEAT_EVERY_MS } from "@/lib/stats-time";
import { setLiveStats } from "@/lib/stats-store";
import type { VisitorStats } from "@/lib/visitor-stats";

// Tells the server this browser has the site open: once on load, then about
// once a minute while the tab is visible. Paused while the tab is hidden.
// Lives in the root layout, so it runs on every page and survives navigation.

const MIN_GAP_MS = 30_000;
let lastSent = 0;

async function beat() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastSent < MIN_GAP_MS) return;
  lastSent = Date.now();
  try {
    const res = await fetch("/api/presence", { method: "POST", cache: "no-store", keepalive: true });
    if (res.ok || res.status === 429) setLiveStats((await res.json()) as VisitorStats);
  } catch {
    // Offline: try again on the next beat.
  }
}

export function Heartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void beat(), HEARTBEAT_EVERY_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void beat();
        start();
      } else {
        stop();
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}

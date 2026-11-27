"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { feedHref, parseFeedParams, type FeedTab, type TopRange } from "@/lib/feed-types";
import { useFeedNav } from "./FeedNav";
import { FlameIcon, SparkIcon, TrophyIcon } from "./icons";

const TABS: { id: FeedTab; label: string; Icon: typeof SparkIcon }[] = [
  { id: "latest", label: "Latest", Icon: SparkIcon },
  { id: "trending", label: "Trending", Icon: FlameIcon },
  { id: "top", label: "Top", Icon: TrophyIcon },
];

const RANGES: { id: TopRange; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

export function FeedTabs({ active: current, range: currentRange }: { active: FeedTab | null; range?: TopRange }) {
  const nav = useFeedNav();
  // While a switch is loading, show the clicked tab/range as selected already.
  const pendingParams = nav?.target
    ? parseFeedParams(Object.fromEntries(new URL(nav.target, "http://x").searchParams))
    : null;
  const active = pendingParams?.tab ?? current;
  const range = pendingParams ? pendingParams.range : currentRange;

  // Plain clicks go through the transition; modified clicks (new tab) stay native.
  const onClick = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!nav || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    nav.go(href);
  };

  return (
    <div className="mb-5 space-y-3">
      <nav aria-label="Feed" className="grid grid-cols-3 gap-1 rounded-full bg-cream-deep p-1">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <Link
              key={id}
              href={feedHref(id, range)}
              onClick={onClick(feedHref(id, range))}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition active:scale-[0.97] ${
                isActive
                  ? "bg-espresso text-cream shadow-sm"
                  : "text-ink-soft hover:bg-white/60 hover:text-espresso"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {active === "top" && (
        <nav aria-label="Time range" className="flex flex-wrap gap-2">
          {RANGES.map(({ id, label }) => {
            const isActive = (range ?? "week") === id;
            return (
              <Link
                key={id}
                href={feedHref("top", id)}
                onClick={onClick(feedHref("top", id))}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold transition active:scale-95 ${
                  isActive
                    ? "border-gold bg-gold-soft text-gold-deep"
                    : "border-espresso/15 text-ink-soft hover:border-gold/60 hover:text-espresso"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

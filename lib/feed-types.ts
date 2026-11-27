// Client-safe feed types and URL parsing (no server imports here).

export const FEED_TABS = ["latest", "trending", "top"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

export const TOP_RANGES = ["week", "month", "all"] as const;
export type TopRange = (typeof TOP_RANGES)[number];

export const PAGE_SIZE = 20;

/** A post as shown on a feed card. Dates are ISO strings so pages can travel as JSON. */
export type FeedPost = {
  id: string;
  title: string;
  excerpt: string;
  nickname: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  likedByMe: boolean;
};

export type FeedPage = {
  posts: FeedPost[];
  /** Opaque cursor for the next page, or null at the end. */
  nextCursor: string | null;
  /** Server time the page was read (ms), for relative times. */
  readAt: number;
};

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parse ?tab=…&range=… with safe defaults. `newest` is accepted for old links. */
export function parseFeedParams(params: RawParams): { tab: FeedTab; range: TopRange } {
  const rawTab = first(params.tab);
  const tab: FeedTab =
    rawTab === "trending" || rawTab === "top" ? rawTab : "latest";
  const rawRange = first(params.range);
  const range: TopRange = rawRange === "month" || rawRange === "all" ? rawRange : "week";
  return { tab, range };
}

export function feedHref(tab: FeedTab, range: TopRange = "week"): string {
  if (tab === "latest") return "/";
  if (tab === "trending") return "/?tab=trending";
  return `/?tab=top&range=${range}`;
}

// Canonical site URL, used for share links and link previews.
// NEXT_PUBLIC_ so the browser bundle gets it too; set it in Vercel when a custom
// domain is added. Inlined at build time.

const DEFAULT_SITE_URL = "https://aratalk.vercel.app";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

export function postUrl(postId: string): string {
  return `${SITE_URL}/post/${encodeURIComponent(postId)}`;
}

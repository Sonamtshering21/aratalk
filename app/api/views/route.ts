import type { NextRequest } from "next/server";
import { z } from "zod";
import { isCrawler } from "@/lib/bots";
import { hashedIp, requireIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_BATCH, recordViews } from "@/lib/views";

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(MAX_BATCH),
});

const noStore = { "Cache-Control": "no-store" };
const empty = () => Response.json({ counts: {} }, { headers: noStore });

/** Only accept requests from our own pages (blocks cross-site view stuffing). */
function sameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * POST /api/views  body: {"ids": ["postId", …]}
 * Sent by the browser every ~10 s with fetch, or with navigator.sendBeacon when
 * the page is hidden. The body is JSON sent as text/plain, which sendBeacon allows.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(await request.text()));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });

  // Crawlers are ignored quietly; they never read the response anyway.
  if (isCrawler(request.headers.get("user-agent"))) return empty();

  // The anonymous cookie is issued on page load; requests without it are ignored.
  const me = await requireIdentity();
  if (!me) return new Response(null, { status: 401, headers: noStore });

  // One view batch per 10 s per browser and per IP.
  if (!(await rateLimit("view", me.hash, await hashedIp()))) {
    return Response.json({ counts: {} }, { status: 429, headers: { ...noStore, "Retry-After": "10" } });
  }

  const counts = await recordViews([...new Set(parsed.data.ids)], me.hash);
  return Response.json({ counts }, { headers: noStore });
}

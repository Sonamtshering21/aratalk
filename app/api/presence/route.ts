import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { isCrawler } from "@/lib/bots";
import { hashedIp, requireIdentity } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/same-origin";
import { getVisitorStats, recordHeartbeat } from "@/lib/visitor-stats";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/presence — the browser's heartbeat (about once a minute while the
 * tab is visible). Records "reading now" and "visitors this month" for this
 * browser and answers with the current (≤30 s old) numbers. Only counts are
 * returned; no hashes, no IPs.
 */
export async function POST(request: NextRequest) {
  await connection();
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const now = Date.now();

  // Crawlers don't count, but can still see the numbers.
  if (isCrawler(request.headers.get("user-agent"))) {
    return Response.json(await getVisitorStats(now), { headers: noStore });
  }

  // The anonymous cookie is issued on page load; no cookie, no heartbeat.
  const me = await requireIdentity();
  if (!me) return new Response(null, { status: 401, headers: noStore });

  if (!(await rateLimit("presence", me.hash, await hashedIp()))) {
    return Response.json(await getVisitorStats(now), { status: 429, headers: noStore });
  }

  const [, stats] = await Promise.all([recordHeartbeat(me.hash, now), getVisitorStats(now)]);
  return Response.json(stats, { headers: noStore });
}

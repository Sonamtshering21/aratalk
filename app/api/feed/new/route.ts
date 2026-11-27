import type { NextRequest } from "next/server";
import { countPostsSince } from "@/lib/feed";

/** GET /api/feed/new?since=<ms> → { count } of visible posts created after `since`. */
export async function GET(request: NextRequest) {
  const since = Number(request.nextUrl.searchParams.get("since"));
  if (!Number.isFinite(since) || since <= 0) {
    return Response.json({ error: "Invalid `since`." }, { status: 400 });
  }
  const count = await countPostsSince(since);
  return Response.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
}

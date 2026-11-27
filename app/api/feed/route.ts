import type { NextRequest } from "next/server";
import { getFeedPage } from "@/lib/feed";
import { parseFeedParams } from "@/lib/feed-types";

/** GET /api/feed?tab=latest|trending|top&range=week|month|all&cursor=… */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { tab, range } = parseFeedParams({
    tab: sp.get("tab") ?? undefined,
    range: sp.get("range") ?? undefined,
  });
  const page = await getFeedPage(tab, range, sp.get("cursor"));
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}

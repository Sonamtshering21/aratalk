import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { getRepliesPage, isThreadOnVisiblePost } from "@/lib/comments";

/** GET /api/comments/:id/replies?cursor=… → next page of replies (20), oldest first. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/comments/[id]/replies">) {
  await connection();
  const { id } = await ctx.params;
  if (id.length > 40 || !(await isThreadOnVisiblePost(id))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const page = await getRepliesPage(id, request.nextUrl.searchParams.get("cursor"));
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}

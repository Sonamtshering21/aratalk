import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { getThreadsPage } from "@/lib/comments";
import { prisma } from "@/lib/prisma";

/** GET /api/posts/:id/comments?cursor=… → next page of top-level comments (20). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/posts/[id]/comments">) {
  await connection();
  const { id } = await ctx.params;
  const post = await prisma.post.findFirst({ where: { id, hidden: false }, select: { id: true } });
  if (!post) return Response.json({ error: "Not found" }, { status: 404 });
  const page = await getThreadsPage(post.id, request.nextUrl.searchParams.get("cursor"));
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}

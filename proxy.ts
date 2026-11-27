import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// With Cache Components the page shell streams with a 200 before the post is
// loaded, so notFound() inside the page can't change the status. Checking here,
// before rendering starts, lets missing or hidden posts return a real 404.
// It's a single primary-key lookup.

export const config = {
  matcher: "/post/:id",
};

export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2] ?? "";
  if (id.length > 0 && id.length <= 40) {
    const post = await prisma.post.findFirst({
      where: { id, hidden: false },
      select: { id: true },
    });
    if (post) return NextResponse.next();
  }
  // Rewrite to a path no route matches: Next renders app/not-found.tsx with 404.
  return NextResponse.rewrite(new URL("/__post-not-found", request.url), { status: 404 });
}

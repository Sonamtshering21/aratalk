import { NextResponse, type NextRequest } from "next/server";
import { IDENTITY_COOKIE, isValidIdentityValue, newIdentityCookie } from "@/lib/identity-cookie";
import { prisma } from "@/lib/prisma";

// Runs before every page request (not static files or /api):
// 1. Issues the anonymous browser id cookie on the first page load. Writes
//    require it and never create it, so cookie-less scripts are ignored.
// 2. Returns a real 404 for missing or hidden posts. With Cache Components the
//    page shell streams with a 200 before the post is loaded, so notFound()
//    inside the page can't change the status. It's one primary-key lookup.

export const config = {
  matcher: ["/((?!_next/|api/|icon|apple-icon|favicon|robots\\.txt|sitemap\\.xml).*)"],
};

const POST_PATH = /^\/post\/([^/]+)\/?$/;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next();

  const match = POST_PATH.exec(request.nextUrl.pathname);
  if (match) {
    const id = decodeURIComponent(match[1] ?? "");
    const post =
      id.length > 0 && id.length <= 40
        ? await prisma.post.findFirst({ where: { id, hidden: false }, select: { id: true } })
        : null;
    if (!post) {
      // Rewrite to a path no route matches: Next renders app/not-found.tsx with 404.
      response = NextResponse.rewrite(new URL("/__post-not-found", request.url), { status: 404 });
    }
  }

  const isRead = request.method === "GET" || request.method === "HEAD";
  if (isRead && !isValidIdentityValue(request.cookies.get(IDENTITY_COOKIE)?.value)) {
    response.cookies.set(newIdentityCookie());
  }
  return response;
}

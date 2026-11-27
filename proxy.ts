import { NextResponse, type NextRequest } from "next/server";
import { IDENTITY_COOKIE, isValidIdentityValue, newIdentityCookie } from "@/lib/identity-cookie";
import { prisma } from "@/lib/prisma";

// Runs before every page request (not static files or /api):
// 1. Issues the anonymous browser id cookie on the first page load. Writes
//    require it and never create it, so cookie-less scripts are ignored.
// 2. Returns a real 404 for missing or hidden posts. With Cache Components the
//    page shell streams with a 200 before the post is loaded, so notFound()
//    inside the page can't change the status. It's one primary-key lookup, and
//    only for full page loads: in-app navigations, prefetches and server
//    actions skip it (the page's own notFound() covers them, status unused).

export const config = {
  matcher: ["/((?!_next/|api/|icon|apple-icon|favicon|robots\\.txt|sitemap\\.xml).*)"],
};

const POST_PATH = /^\/post\/([^/]+)\/?$/;

/**
 * A full document load, as opposed to an in-app navigation, a link prefetch or a
 * server action. Next.js strips its `rsc`/prefetch headers before Proxy runs,
 * but client navigations and prefetches still carry `next-url`, and browsers
 * mark real page loads with `sec-fetch-dest: document`. Crawlers send neither
 * fetch-metadata header, so they still get the real 404.
 */
function isDocumentRead(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const h = request.headers;
  if (h.has("next-url")) return false;
  const dest = h.get("sec-fetch-dest");
  return dest === null || dest === "document";
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next();

  const match = isDocumentRead(request) ? POST_PATH.exec(request.nextUrl.pathname) : null;
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

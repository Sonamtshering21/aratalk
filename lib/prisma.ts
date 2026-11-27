import { PrismaClient } from "@prisma/client";

// One shared client per server process (also across dev hot reloads), so the
// proxy, server actions and route handlers all use the same small pool.

const DEFAULT_POOL_SIZE = 5;
const POOL_TIMEOUT_SECONDS = 15;

/** Add a small connection pool to DATABASE_URL unless it already sets one. */
export function withPoolLimits(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    const size = Number(process.env.DATABASE_POOL_SIZE) || DEFAULT_POOL_SIZE;
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", String(size));
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", String(POOL_TIMEOUT_SECONDS));
    return u.toString();
  } catch {
    return url; // let Prisma report a malformed URL itself
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: withPoolLimits(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;

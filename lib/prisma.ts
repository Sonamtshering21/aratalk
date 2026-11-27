import { PrismaClient } from "@prisma/client";

// One shared client per server instance (also across dev hot reloads), so the
// proxy, server actions and route handlers all use the same small pool.
//
// Serverless + Neon: DATABASE_URL should be Neon's *pooled* connection string
// (host contains "-pooler"); each function instance keeps a small pool and the
// Neon pooler multiplexes them. Functions run in sin1 (vercel.json), next to
// the Neon project in Singapore.

const DEFAULT_POOL_SIZE = 5;
const POOL_TIMEOUT_SECONDS = 15;
// Neon may scale to zero; the first connection waits for it to wake up.
const CONNECT_TIMEOUT_SECONDS = 15;

/** Add pool and timeout settings to DATABASE_URL unless it already sets them. */
export function withPoolLimits(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    const set = (key: string, value: string) => {
      if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    };
    set("connection_limit", String(Number(process.env.DATABASE_POOL_SIZE) || DEFAULT_POOL_SIZE));
    set("pool_timeout", String(POOL_TIMEOUT_SECONDS));
    set("connect_timeout", String(CONNECT_TIMEOUT_SECONDS));
    // Behind PgBouncer (Neon's pooler), tell Prisma so it doesn't rely on
    // prepared statements surviving between transactions.
    if (u.hostname.includes("-pooler")) set("pgbouncer", "true");
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

import { prisma } from "./prisma";

// Post views: one per browser (anonymous identity hash) per post, ever.
// The browser batches post ids it has seen; the server records new
// (postId, userHash) rows and bumps Post.viewCount only for rows it created.

export const MAX_BATCH = 50;
const RETENTION_DAYS = 30;
const CLEANUP_CHANCE = 0.02;

/**
 * Record views for `postIds` by one browser.
 * Returns the current viewCount of every visible post in the batch.
 */
export async function recordViews(
  postIds: string[],
  userHash: string,
): Promise<Record<string, number>> {
  // One statement: keep visible posts, insert new (postId, userHash) rows,
  // bump viewCount only for rows that were actually inserted, return counts.
  const rows = await prisma.$queryRaw<{ id: string; viewCount: number }[]>`
    WITH vis AS (
      SELECT "id", "viewCount" FROM "Post" WHERE "id" = ANY(${postIds}::text[]) AND "hidden" = false
    ), ins AS (
      INSERT INTO "PostView" ("postId", "userHash")
      SELECT "id", ${userHash} FROM vis
      ON CONFLICT DO NOTHING RETURNING "postId"
    ), upd AS (
      UPDATE "Post" p SET "viewCount" = p."viewCount" + 1
      FROM ins WHERE p."id" = ins."postId"
      RETURNING p."id", p."viewCount"
    )
    SELECT v."id", COALESCE(u."viewCount", v."viewCount") AS "viewCount"
    FROM vis v LEFT JOIN upd u ON u."id" = v."id"`;

  if (Math.random() < CLEANUP_CHANCE) {
    await prisma.postView.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } },
    });
  }

  return Object.fromEntries(rows.map((r) => [r.id, r.viewCount]));
}

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
  const visible = await prisma.post.findMany({
    where: { id: { in: postIds }, hidden: false },
    select: { id: true },
  });
  if (visible.length === 0) return {};
  const ids = visible.map((p) => p.id);

  const counts = await prisma.$transaction(async (tx) => {
    // Unique (postId, userHash): repeats are skipped, only new rows come back.
    const created = await tx.postView.createManyAndReturn({
      data: ids.map((postId) => ({ postId, userHash })),
      skipDuplicates: true,
      select: { postId: true },
    });
    if (created.length > 0) {
      await tx.post.updateMany({
        where: { id: { in: created.map((c) => c.postId) } },
        data: { viewCount: { increment: 1 } },
      });
    }
    return tx.post.findMany({
      where: { id: { in: ids } },
      select: { id: true, viewCount: true },
    });
  });

  if (Math.random() < CLEANUP_CHANCE) {
    await prisma.postView.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } },
    });
  }

  return Object.fromEntries(counts.map((c) => [c.id, c.viewCount]));
}

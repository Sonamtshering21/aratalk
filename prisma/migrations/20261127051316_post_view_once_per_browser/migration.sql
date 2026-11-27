/*
  Warnings:

  - The primary key for the `PostView` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `day` on the `PostView` table. All the data in the column will be lost.

*/
-- Views now count once per browser per post (not once per day).
-- Keep only the earliest row per (postId, userHash) so the new primary key fits.
-- Post.viewCount is left as is: it is the running total and keeps past views.
DELETE FROM "PostView" a
USING "PostView" b
WHERE a."postId" = b."postId"
  AND a."userHash" = b."userHash"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a.ctid > b.ctid));

-- DropIndex
DROP INDEX "PostView_day_idx";

-- AlterTable
ALTER TABLE "PostView" DROP CONSTRAINT "PostView_pkey",
DROP COLUMN "day",
ADD CONSTRAINT "PostView_pkey" PRIMARY KEY ("postId", "userHash");

-- CreateIndex
CREATE INDEX "PostView_createdAt_idx" ON "PostView"("createdAt");

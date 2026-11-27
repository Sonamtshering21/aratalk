-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "shareCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PostShare" (
    "postId" TEXT NOT NULL,
    "userHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostShare_pkey" PRIMARY KEY ("postId","userHash")
);

-- CreateIndex
CREATE INDEX "PostShare_userHash_idx" ON "PostShare"("userHash");

-- AddForeignKey
ALTER TABLE "PostShare" ADD CONSTRAINT "PostShare_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Presence" (
    "userHash" CHAR(64) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presence_pkey" PRIMARY KEY ("userHash")
);

-- CreateTable
CREATE TABLE "MonthlyVisitor" (
    "month" CHAR(7) NOT NULL,
    "userHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyVisitor_pkey" PRIMARY KEY ("month","userHash")
);

-- CreateIndex
CREATE INDEX "Presence_lastSeen_idx" ON "Presence"("lastSeen");

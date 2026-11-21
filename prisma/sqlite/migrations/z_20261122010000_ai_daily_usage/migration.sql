-- CreateTable
CREATE TABLE "AiDailyUsage" (
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "feature", "day"),
    CONSTRAINT "AiDailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AiDailyUsage_day_idx" ON "AiDailyUsage"("day");

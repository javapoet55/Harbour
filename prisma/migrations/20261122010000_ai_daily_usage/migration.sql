-- Per-user daily quota for each signed-in AI feature.
CREATE TABLE "AiDailyUsage" (
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiDailyUsage_pkey" PRIMARY KEY ("userId", "feature", "day")
);
CREATE INDEX "AiDailyUsage_day_idx" ON "AiDailyUsage"("day");
ALTER TABLE "AiDailyUsage" ADD CONSTRAINT "AiDailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

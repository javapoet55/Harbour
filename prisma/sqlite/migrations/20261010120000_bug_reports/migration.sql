CREATE TABLE "Feedback_new" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "stars" INTEGER NOT NULL CHECK ("stars" BETWEEN 0 AND 5),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Feedback_new" SELECT * FROM "Feedback";
DROP TABLE "Feedback";
ALTER TABLE "Feedback_new" RENAME TO "Feedback";
CREATE INDEX "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
CREATE TABLE "BugReport" (
 "id" TEXT NOT NULL PRIMARY KEY, "reference" TEXT NOT NULL, "metadata" TEXT NOT NULL,
 "screenshot" TEXT, "screenshotExpiresAt" DATETIME NOT NULL, "expiresAt" DATETIME NOT NULL,
 "emailSentAt" DATETIME, "leaseUntil" DATETIME, "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "BugReport_id_fkey" FOREIGN KEY ("id") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BugReport_reference_key" ON "BugReport"("reference");
CREATE INDEX "BugReport_nextAttemptAt_emailSentAt_idx" ON "BugReport"("nextAttemptAt", "emailSentAt");
CREATE INDEX "BugReport_expiresAt_idx" ON "BugReport"("expiresAt");

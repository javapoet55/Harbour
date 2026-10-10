ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_stars_check";
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_stars_check" CHECK ("stars" BETWEEN 0 AND 5);

CREATE TABLE "BugReport" (
 "id" TEXT NOT NULL PRIMARY KEY, "reference" TEXT NOT NULL, "metadata" TEXT NOT NULL,
 "screenshot" TEXT, "screenshotExpiresAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "emailSentAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "BugReport_id_fkey" FOREIGN KEY ("id") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BugReport_reference_key" ON "BugReport"("reference");
CREATE INDEX "BugReport_nextAttemptAt_emailSentAt_idx" ON "BugReport"("nextAttemptAt", "emailSentAt");
CREATE INDEX "BugReport_expiresAt_idx" ON "BugReport"("expiresAt");

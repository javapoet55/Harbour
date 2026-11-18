ALTER TABLE "BugReport" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
UPDATE "BugReport" SET "status" = 'closed' WHERE "closedAt" IS NOT NULL;

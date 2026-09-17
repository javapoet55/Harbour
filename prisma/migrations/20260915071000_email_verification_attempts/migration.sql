-- AlterTable
ALTER TABLE "EmailVerificationToken" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Accounts created before sign-in required a verified email keep working.
-- The cutoff is when that requirement first deployed; later sign-ups must verify.
UPDATE "User" SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL AND "createdAt" < '2026-09-15 07:09:15';

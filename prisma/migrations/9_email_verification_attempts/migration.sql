ALTER TABLE "EmailVerificationToken" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Accounts created before web sign-in required a verified email keep working.
-- Prisma stores SQLite DateTime values as epoch milliseconds.
UPDATE "User" SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL AND "createdAt" < CAST(strftime('%s', '2026-09-15 06:04:02') AS INTEGER) * 1000;

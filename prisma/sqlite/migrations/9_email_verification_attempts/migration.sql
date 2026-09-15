ALTER TABLE "EmailVerificationToken" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Accounts created before sign-in required a verified email keep working.
-- Matches the Postgres migration cutoff. Prisma stores SQLite DateTime values as epoch milliseconds.
UPDATE "User" SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL AND "createdAt" < CAST(strftime('%s', '2026-09-15 07:09:15') AS INTEGER) * 1000;

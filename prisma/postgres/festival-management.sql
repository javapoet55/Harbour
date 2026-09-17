-- Additive, deploy before the updated backend.
ALTER TABLE "ImportantMoment" ADD COLUMN IF NOT EXISTS "festivalSettings" TEXT NOT NULL DEFAULT '{}';

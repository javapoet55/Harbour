-- Daily food check-in calls and the food log. Additive only: no existing table changes.
CREATE TABLE "NutritionCallSettings" (
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "phoneE164" TEXT,
  "phoneVerifiedAt" DATETIME,
  "phoneCodeHash" TEXT,
  "phoneCodeExpiresAt" DATETIME,
  "phoneCodeAttempts" INTEGER NOT NULL DEFAULT 0,
  "phoneCodeSentAt" DATETIME,
  "consentAt" DATETIME,
  "localTime" TEXT NOT NULL DEFAULT '20:00',
  "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  "repeatDaily" BOOLEAN NOT NULL DEFAULT true,
  "noAnswer" TEXT NOT NULL DEFAULT 'NOTIFY',
  "voice" TEXT NOT NULL DEFAULT 'marin',
  "calorieGoal" INTEGER NOT NULL DEFAULT 2000,
  "goalsJson" TEXT,
  "lastManualCallAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NutritionCallSettings_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "NutritionCallSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "NutritionCallSettings_enabled_idx" ON "NutritionCallSettings"("enabled");

CREATE TABLE "NutritionCall" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "scheduledFor" DATETIME NOT NULL,
  "twilioCallSid" TEXT,
  "answeredBy" TEXT,
  "startedAt" DATETIME,
  "endedAt" DATETIME,
  "durationSec" INTEGER,
  "endReason" TEXT,
  "noiseFilter" TEXT,
  "transcriptJson" TEXT,
  "backupTranscriptJson" TEXT,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NutritionCall_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NutritionCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NutritionCall_twilioCallSid_key" ON "NutritionCall"("twilioCallSid");
CREATE UNIQUE INDEX "NutritionCall_userId_localDate_attempt_key" ON "NutritionCall"("userId", "localDate", "attempt");
CREATE INDEX "NutritionCall_status_scheduledFor_idx" ON "NutritionCall"("status", "scheduledFor");

CREATE TABLE "FoodLogEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "meal" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "foodName" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION,
  "unit" TEXT,
  "grams" DOUBLE PRECISION,
  "kcal" INTEGER NOT NULL,
  "proteinG" DOUBLE PRECISION,
  "carbsG" DOUBLE PRECISION,
  "fatG" DOUBLE PRECISION,
  "source" TEXT NOT NULL,
  "sourceRef" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "reviewReason" TEXT,
  "callId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FoodLogEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoodLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FoodLogEntry_callId_fkey" FOREIGN KEY ("callId") REFERENCES "NutritionCall"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "FoodLogEntry_userId_localDate_idx" ON "FoodLogEntry"("userId", "localDate");
CREATE INDEX "FoodLogEntry_callId_idx" ON "FoodLogEntry"("callId");

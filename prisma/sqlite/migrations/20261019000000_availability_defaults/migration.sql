-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workingDays" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "workStart" TEXT NOT NULL DEFAULT '06:00',
    "workEnd" TEXT NOT NULL DEFAULT '21:00',
    "quietStart" TEXT NOT NULL DEFAULT '21:00',
    "quietEnd" TEXT NOT NULL DEFAULT '06:00',
    "defaultDurationMin" INTEGER NOT NULL DEFAULT 30,
    "defaultReminderMinutes" INTEGER NOT NULL DEFAULT 30,
    "confirmationLevel" TEXT NOT NULL DEFAULT 'CHANGES_AND_DELETES',
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "morningSummary" BOOLEAN NOT NULL DEFAULT true,
    "eveningSummary" BOOLEAN NOT NULL DEFAULT true,
    "weeklySummary" BOOLEAN NOT NULL DEFAULT true,
    "escalateToEmailMinutes" INTEGER NOT NULL DEFAULT 15,
    "escalateToSmsMinutes" INTEGER NOT NULL DEFAULT 45,
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "transcriptRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "audioRetentionHours" INTEGER NOT NULL DEFAULT 0,
    "defaultCalendarId" TEXT,
    "phoneNumber" TEXT,
    "personalizationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "personalizationConsentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserPreference" ("audioRetentionHours", "confirmationLevel", "createdAt", "defaultCalendarId", "defaultDurationMin", "defaultReminderMinutes", "emailEnabled", "escalateToEmailMinutes", "escalateToSmsMinutes", "eveningSummary", "id", "morningSummary", "personalizationConsentAt", "personalizationEnabled", "phoneNumber", "pushEnabled", "quietEnd", "quietStart", "smsEnabled", "transcriptRetentionDays", "updatedAt", "userId", "voiceEnabled", "weeklySummary", "workEnd", "workStart", "workingDays") SELECT "audioRetentionHours", "confirmationLevel", "createdAt", "defaultCalendarId", "defaultDurationMin", "defaultReminderMinutes", "emailEnabled", "escalateToEmailMinutes", "escalateToSmsMinutes", "eveningSummary", "id", "morningSummary", "personalizationConsentAt", "personalizationEnabled", "phoneNumber", "pushEnabled", "quietEnd", "quietStart", "smsEnabled", "transcriptRetentionDays", "updatedAt", "userId", "voiceEnabled", "weeklySummary", "workEnd", "workStart", "workingDays" FROM "UserPreference";
DROP TABLE "UserPreference";
ALTER TABLE "new_UserPreference" RENAME TO "UserPreference";
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


UPDATE "UserPreference"
SET "workingDays" = '0,1,2,3,4,5,6', "workStart" = '06:00', "workEnd" = '21:00', "quietEnd" = '06:00'
WHERE "workingDays" = '1,2,3,4,5' AND "workStart" = '09:00'
  AND "workEnd" = '17:00' AND "quietStart" = '21:00' AND "quietEnd" = '07:00';

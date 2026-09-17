-- CreateTable
CREATE TABLE "ImportantMoment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "occurrenceDate" TEXT NOT NULL,
    "timeZoneID" TEXT NOT NULL,
    "yearly" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "snoozedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportantMoment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WishDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "momentID" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'Warm',
    "body" TEXT NOT NULL,
    "personalContext" TEXT NOT NULL DEFAULT '',
    "generationVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WishDraft_momentID_fkey" FOREIGN KEY ("momentID") REFERENCES "ImportantMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftID" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAtUTC" DATETIME NOT NULL,
    "timeZoneID" TEXT NOT NULL,
    "automaticDelivery" BOOLEAN NOT NULL DEFAULT false,
    "reminderOffset" INTEGER NOT NULL DEFAULT 0,
    "annualMonthDay" TEXT NOT NULL DEFAULT '',
    "repeatYearly" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageID" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL,
    "claimedAt" DATETIME,
    "sentAt" DATETIME,
    "approvedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryPlan_draftID_fkey" FOREIGN KEY ("draftID") REFERENCES "WishDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MomentEmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MomentEmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);



CREATE UNIQUE INDEX "ImportantMoment_userId_sourceKey_key" ON "ImportantMoment"("userId", "sourceKey");



CREATE UNIQUE INDEX "DeliveryPlan_idempotencyKey_key" ON "DeliveryPlan"("idempotencyKey");



CREATE INDEX "DeliveryPlan_status_nextAttemptAt_idx" ON "DeliveryPlan"("status", "nextAttemptAt");



CREATE UNIQUE INDEX "MomentEmailAccount_userId_key" ON "MomentEmailAccount"("userId");

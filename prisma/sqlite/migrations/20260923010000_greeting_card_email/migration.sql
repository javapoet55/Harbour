-- CreateTable
CREATE TABLE "GreetingCardImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GreetingCardImage_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "ImportantMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryPlan" (
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
    "cardId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryPlan_draftID_fkey" FOREIGN KEY ("draftID") REFERENCES "WishDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryPlan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "GreetingCardImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryPlan" ("annualMonthDay", "approvedAt", "attempts", "automaticDelivery", "body", "channel", "claimedAt", "createdAt", "draftID", "id", "idempotencyKey", "lastError", "nextAttemptAt", "providerMessageID", "recipient", "reminderOffset", "repeatYearly", "scheduledAtUTC", "sentAt", "status", "subject", "timeZoneID", "updatedAt") SELECT "annualMonthDay", "approvedAt", "attempts", "automaticDelivery", "body", "channel", "claimedAt", "createdAt", "draftID", "id", "idempotencyKey", "lastError", "nextAttemptAt", "providerMessageID", "recipient", "reminderOffset", "repeatYearly", "scheduledAtUTC", "sentAt", "status", "subject", "timeZoneID", "updatedAt" FROM "DeliveryPlan";
DROP TABLE "DeliveryPlan";
ALTER TABLE "new_DeliveryPlan" RENAME TO "DeliveryPlan";
CREATE UNIQUE INDEX "DeliveryPlan_idempotencyKey_key" ON "DeliveryPlan"("idempotencyKey");
CREATE INDEX "DeliveryPlan_status_nextAttemptAt_idx" ON "DeliveryPlan"("status", "nextAttemptAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GreetingCardImage_momentId_createdAt_idx" ON "GreetingCardImage"("momentId", "createdAt");


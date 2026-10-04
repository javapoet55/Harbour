ALTER TABLE "ShoppingList" ADD COLUMN "storeName" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "storeAddress" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "storeZip" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "chosenOffer" JSONB;
CREATE TABLE "ShoppingOfferSource" (
 "id" TEXT NOT NULL PRIMARY KEY, "store" TEXT NOT NULL, "region" TEXT NOT NULL, "url" TEXT NOT NULL,
 "lastCheckedAt" DATETIME, "lastSuccessAt" DATETIME, "nextCheckAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" DATETIME, "leaseToken" TEXT, "failures" INTEGER NOT NULL DEFAULT 0, "error" TEXT
);
CREATE TABLE "ShoppingOffer" (
 "id" TEXT NOT NULL PRIMARY KEY, "sourceId" TEXT NOT NULL, "product" TEXT NOT NULL,
 "brand" TEXT, "packageSize" TEXT, "price" TEXT, "savings" TEXT, "unitPrice" TEXT,
 "conditions" TEXT NOT NULL, "imageURL" TEXT, "sourceURL" TEXT NOT NULL,
 "startsAt" DATETIME NOT NULL, "expiresAt" DATETIME NOT NULL, "checkedAt" DATETIME NOT NULL,
 CONSTRAINT "ShoppingOffer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ShoppingOfferSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ShoppingOffer_sourceId_expiresAt_idx" ON "ShoppingOffer"("sourceId", "expiresAt");

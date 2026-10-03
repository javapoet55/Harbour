ALTER TABLE "ShoppingList" ADD COLUMN "storeName" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "storeAddress" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "storeZip" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "chosenOffer" JSONB;
CREATE TABLE "ShoppingOfferSource" (
 "id" TEXT NOT NULL PRIMARY KEY, "store" TEXT NOT NULL, "region" TEXT NOT NULL, "url" TEXT NOT NULL,
 "lastCheckedAt" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT, "failures" INTEGER NOT NULL DEFAULT 0, "error" TEXT
);
CREATE TABLE "ShoppingOffer" (
 "id" TEXT NOT NULL PRIMARY KEY, "sourceId" TEXT NOT NULL, "product" TEXT NOT NULL,
 "brand" TEXT, "packageSize" TEXT, "price" TEXT, "savings" TEXT, "unitPrice" TEXT,
 "conditions" TEXT NOT NULL, "imageURL" TEXT, "sourceURL" TEXT NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "checkedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ShoppingOffer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ShoppingOfferSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ShoppingOffer_sourceId_expiresAt_idx" ON "ShoppingOffer"("sourceId", "expiresAt");

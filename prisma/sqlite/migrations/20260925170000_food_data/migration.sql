ALTER TABLE "ShoppingItem" ADD COLUMN "barcode" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "brand" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "favorite" BOOLEAN;
ALTER TABLE "ShoppingItem" ADD COLUMN "favoriteAlternatives" JSONB;
CREATE TABLE "FoodDataCache" ("key" TEXT NOT NULL PRIMARY KEY, "schemaVersion" INTEGER NOT NULL DEFAULT 1, "payload" TEXT, "expiresAt" TIMESTAMP NOT NULL, "staleUntil" TIMESTAMP NOT NULL, "leaseUntil" TIMESTAMP NOT NULL);
CREATE INDEX "FoodDataCache_staleUntil_idx" ON "FoodDataCache"("staleUntil");
CREATE TABLE "FoodProviderBudget" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "resetAt" TIMESTAMP NOT NULL);

ALTER TABLE "ShoppingEmailSchedule" ADD COLUMN "sendDate" TEXT;
ALTER TABLE "ShoppingEmailSchedule" ADD COLUMN "oneTimeQueued" BOOLEAN NOT NULL DEFAULT false;

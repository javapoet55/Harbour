ALTER TABLE "ShoppingEmailSchedule" ADD COLUMN "customerPhone" TEXT;

-- Old snapshots lack the required customer contact number and use the old item-selection rules.
UPDATE "ShoppingEmailRun" SET "status" = 'cancelled', "detail" = 'Add your phone number in Share List and save to resume emails' WHERE "status" = 'pending';
UPDATE "ShoppingEmailSchedule" SET "enabled" = false WHERE "customerPhone" IS NULL;

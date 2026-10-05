-- Key nutrients on food log entries, and the daily insight settings. Additive only.
ALTER TABLE "FoodLogEntry" ADD COLUMN "fiberG" DOUBLE PRECISION;
ALTER TABLE "FoodLogEntry" ADD COLUMN "calciumMg" DOUBLE PRECISION;
ALTER TABLE "FoodLogEntry" ADD COLUMN "ironMg" DOUBLE PRECISION;
ALTER TABLE "FoodLogEntry" ADD COLUMN "vitaminDIu" DOUBLE PRECISION;
ALTER TABLE "NutritionCallSettings" ADD COLUMN "insightsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NutritionCallSettings" ADD COLUMN "insightHandledKey" TEXT;
ALTER TABLE "NutritionCallSettings" ADD COLUMN "insightHandledAction" TEXT;

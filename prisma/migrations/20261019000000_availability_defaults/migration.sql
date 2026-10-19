-- Expand the standard availability window while retaining customized settings.
ALTER TABLE "UserPreference" ALTER COLUMN "workingDays" SET DEFAULT '0,1,2,3,4,5,6';
ALTER TABLE "UserPreference" ALTER COLUMN "workStart" SET DEFAULT '06:00';
ALTER TABLE "UserPreference" ALTER COLUMN "workEnd" SET DEFAULT '21:00';
ALTER TABLE "UserPreference" ALTER COLUMN "quietEnd" SET DEFAULT '06:00';
UPDATE "UserPreference"
SET "workingDays" = '0,1,2,3,4,5,6', "workStart" = '06:00', "workEnd" = '21:00', "quietEnd" = '06:00'
WHERE "workingDays" = '1,2,3,4,5' AND "workStart" = '09:00'
  AND "workEnd" = '17:00' AND "quietStart" = '21:00' AND "quietEnd" = '07:00';

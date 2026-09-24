-- A rescheduled or snoozed reminder starts a new generation; escalation only counts attempts made for
-- the current one. Existing rows are all generation 0, so current reminders keep their history.
-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "NotificationAttempt" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;

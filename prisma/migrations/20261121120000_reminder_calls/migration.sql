-- Phone-call delivery for reminders: Nexdo calls the user and reads the reminder aloud.
ALTER TABLE "Task" ADD COLUMN "notifyCall" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ReminderCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "twilioCallSid" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReminderCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderCall_twilioCallSid_key" ON "ReminderCall"("twilioCallSid");
CREATE UNIQUE INDEX "ReminderCall_taskId_fireAt_attempt_key" ON "ReminderCall"("taskId", "fireAt", "attempt");
CREATE INDEX "ReminderCall_status_scheduledFor_idx" ON "ReminderCall"("status", "scheduledFor");

ALTER TABLE "ReminderCall" ADD CONSTRAINT "ReminderCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderCall" ADD CONSTRAINT "ReminderCall_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

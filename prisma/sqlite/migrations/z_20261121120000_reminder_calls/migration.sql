-- AlterTable
ALTER TABLE "Task" ADD COLUMN "notifyCall" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReminderCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fireAt" DATETIME NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "twilioCallSid" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReminderCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReminderCall_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReminderCall_twilioCallSid_key" ON "ReminderCall"("twilioCallSid");
CREATE UNIQUE INDEX "ReminderCall_taskId_fireAt_attempt_key" ON "ReminderCall"("taskId", "fireAt", "attempt");
CREATE INDEX "ReminderCall_status_scheduledFor_idx" ON "ReminderCall"("status", "scheduledFor");

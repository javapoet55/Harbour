ALTER TABLE "UserPreference" ADD COLUMN "personalizationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPreference" ADD COLUMN "personalizationConsentAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "actualDurationMin" INTEGER;
ALTER TABLE "Task" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "postponeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "lastRescheduledAt" DATETIME;

CREATE TABLE "TaskWorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "durationMin" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskWorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskWorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TaskWorkSession_userId_startedAt_idx" ON "TaskWorkSession"("userId", "startedAt");
CREATE INDEX "TaskWorkSession_taskId_startedAt_idx" ON "TaskWorkSession"("taskId", "startedAt");

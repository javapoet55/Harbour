ALTER TABLE "Task" ADD COLUMN "intentCategory" TEXT;
ALTER TABLE "Task" ADD COLUMN "intentScore" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN "intentReason" TEXT;
CREATE TABLE "TaskAgentRun" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "taskId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'NEEDS_INPUT',
 "service" TEXT NOT NULL,
 "urgency" TEXT NOT NULL,
 "slotsJson" TEXT NOT NULL,
 "stepsJson" TEXT NOT NULL,
 "resultsJson" TEXT NOT NULL DEFAULT '[]',
 "warningsJson" TEXT NOT NULL DEFAULT '[]',
 "error" TEXT,
 "version" INTEGER NOT NULL DEFAULT 0,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "leaseUntil" TIMESTAMP(3),
 "targetAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "TaskAgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TaskAgentRun_taskId_key" ON "TaskAgentRun"("taskId");
CREATE INDEX "TaskAgentRun_status_leaseUntil_idx" ON "TaskAgentRun"("status", "leaseUntil");

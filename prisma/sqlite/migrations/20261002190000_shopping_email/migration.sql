-- CreateTable
CREATE TABLE "ShoppingEmailSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL DEFAULT 6,
    "hour" INTEGER NOT NULL DEFAULT 10,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "consentAt" DATETIME NOT NULL,
    "nextRunAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShoppingEmailSchedule_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingEmailRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" DATETIME NOT NULL,
    "providerId" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShoppingEmailRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ShoppingEmailSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingEmailSchedule_listId_key" ON "ShoppingEmailSchedule"("listId");

-- CreateIndex
CREATE INDEX "ShoppingEmailSchedule_enabled_nextRunAt_idx" ON "ShoppingEmailSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ShoppingEmailRun_status_retryAt_idx" ON "ShoppingEmailRun"("status", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingEmailRun_scheduleId_dueAt_key" ON "ShoppingEmailRun"("scheduleId", "dueAt");


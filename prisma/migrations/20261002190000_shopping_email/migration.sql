-- CreateTable
CREATE TABLE "ShoppingEmailSchedule" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL DEFAULT 6,
    "hour" INTEGER NOT NULL DEFAULT 10,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingEmailSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingEmailRun" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3) NOT NULL,
    "providerId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingEmailRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingEmailSchedule_listId_key" ON "ShoppingEmailSchedule"("listId");

-- CreateIndex
CREATE INDEX "ShoppingEmailSchedule_enabled_nextRunAt_idx" ON "ShoppingEmailSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ShoppingEmailRun_status_retryAt_idx" ON "ShoppingEmailRun"("status", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingEmailRun_scheduleId_dueAt_key" ON "ShoppingEmailRun"("scheduleId", "dueAt");

-- AddForeignKey
ALTER TABLE "ShoppingEmailSchedule" ADD CONSTRAINT "ShoppingEmailSchedule_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingEmailRun" ADD CONSTRAINT "ShoppingEmailRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ShoppingEmailSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "HealthEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT,
    "traceId" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" REAL NOT NULL,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER
);

-- CreateTable
CREATE TABLE "HealthIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activeKey" TEXT,
    "service" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "HealthRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threshold" REAL NOT NULL,
    "minimumSamples" INTEGER NOT NULL DEFAULT 20,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HealthAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "HealthEvent_createdAt_idx" ON "HealthEvent"("createdAt");

-- CreateIndex
CREATE INDEX "HealthEvent_kind_service_createdAt_idx" ON "HealthEvent"("kind", "service", "createdAt");

-- CreateIndex
CREATE INDEX "HealthEvent_traceId_idx" ON "HealthEvent"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthIncident_activeKey_key" ON "HealthIncident"("activeKey");

-- CreateIndex
CREATE INDEX "HealthIncident_startedAt_idx" ON "HealthIncident"("startedAt");

-- CreateIndex
CREATE INDEX "HealthAudit_targetId_createdAt_idx" ON "HealthAudit"("targetId", "createdAt");

CREATE TRIGGER health_audit_no_update BEFORE UPDATE ON "HealthAudit" BEGIN SELECT RAISE(ABORT, 'HealthAudit is append-only'); END;
CREATE TRIGGER health_audit_no_delete BEFORE DELETE ON "HealthAudit" BEGIN SELECT RAISE(ABORT, 'HealthAudit is append-only'); END;

ALTER TABLE "HealthEvent" ADD COLUMN "costUsd" DOUBLE PRECISION;

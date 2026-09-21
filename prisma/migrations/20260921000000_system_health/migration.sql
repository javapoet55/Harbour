-- CreateTable
CREATE TABLE "HealthEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT,
    "traceId" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" DOUBLE PRECISION NOT NULL,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,

    CONSTRAINT "HealthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIncident" (
    "id" TEXT NOT NULL,
    "activeKey" TEXT,
    "service" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HealthIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthRule" (
    "id" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "minimumSamples" INTEGER NOT NULL DEFAULT 20,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "HealthAudit_pkey" PRIMARY KEY ("id")
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


CREATE FUNCTION health_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'HealthAudit is append-only'; END;
$$;
CREATE TRIGGER health_audit_immutable BEFORE UPDATE OR DELETE ON "HealthAudit" FOR EACH ROW EXECUTE FUNCTION health_audit_append_only();

ALTER TABLE "HealthEvent" ADD COLUMN "costUsd" DOUBLE PRECISION;
CREATE TRIGGER health_audit_no_truncate BEFORE TRUNCATE ON "HealthAudit" FOR EACH STATEMENT EXECUTE FUNCTION health_audit_append_only();

-- "Connect me on the day" calls for Important Moments. Additive only.
ALTER TABLE "ImportantMoment" ADD COLUMN "connectEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ImportantMoment" ADD COLUMN "connectTime" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "ImportantMoment" ADD COLUMN "connectTimeZone" TEXT NOT NULL DEFAULT '';

CREATE TABLE "CallerIdentity" (
  "userId" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "twilioSid" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CallerIdentity_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "CallerIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MomentConnectCall" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "momentId" TEXT NOT NULL,
  "occurrenceDate" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "decision" TEXT,
  "direct" BOOLEAN NOT NULL DEFAULT false,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "twilioCallSid" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "talkSeconds" INTEGER,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MomentConnectCall_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MomentConnectCall_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "ImportantMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MomentConnectCall_twilioCallSid_key" ON "MomentConnectCall"("twilioCallSid");
CREATE UNIQUE INDEX "MomentConnectCall_momentId_occurrenceDate_attempt_key" ON "MomentConnectCall"("momentId", "occurrenceDate", "attempt");
CREATE INDEX "MomentConnectCall_status_scheduledFor_idx" ON "MomentConnectCall"("status", "scheduledFor");
CREATE INDEX "MomentConnectCall_userId_idx" ON "MomentConnectCall"("userId");

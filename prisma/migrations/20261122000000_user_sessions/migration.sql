-- Server-side sessions: sign out everywhere, idle expiry, and sign-out that revokes the cookie.
ALTER TABLE "User" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);

CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Admin sessions: idle expiry within the existing 8-hour limit.
ALTER TABLE "AdminLoginToken" ADD COLUMN "sessionLastUsedAt" TIMESTAMP(3);

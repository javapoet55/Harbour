-- Server-side sessions: sign out everywhere, idle expiry, and sign-out that revokes the cookie.
ALTER TABLE "User" ADD COLUMN "sessionsRevokedAt" DATETIME;

CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- Admin sessions: idle expiry within the existing 8-hour limit.
ALTER TABLE "AdminLoginToken" ADD COLUMN "sessionLastUsedAt" DATETIME;

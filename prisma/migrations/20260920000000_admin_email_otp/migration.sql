CREATE TABLE "AdminLoginToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionHash" TEXT,
  "sessionExpiresAt" TIMESTAMP(3),
  CONSTRAINT "AdminLoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdminLoginToken_sessionHash_key" ON "AdminLoginToken"("sessionHash");
CREATE INDEX "AdminLoginToken_userId_createdAt_idx" ON "AdminLoginToken"("userId", "createdAt");

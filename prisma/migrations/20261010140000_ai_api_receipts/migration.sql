CREATE TABLE "AiApiReceipt" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "audioInput" INTEGER, "audioOutput" INTEGER,
 "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "operation" TEXT NOT NULL, "feature" TEXT NOT NULL, "model" TEXT, "status" INTEGER NOT NULL,
 "inputTokens" INTEGER, "outputTokens" INTEGER, "cachedTokens" INTEGER,
 "durationSeconds" DOUBLE PRECISION, "characters" INTEGER, "costUsd" DOUBLE PRECISION, "pricing" TEXT
);
CREATE INDEX "AiApiReceipt_createdAt_idx" ON "AiApiReceipt"("createdAt");
CREATE INDEX "AiApiReceipt_operation_createdAt_idx" ON "AiApiReceipt"("operation", "createdAt");

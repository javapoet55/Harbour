CREATE TABLE "Feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(5000) NOT NULL,
  "stars" INTEGER NOT NULL CHECK ("stars" BETWEEN 1 AND 5),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

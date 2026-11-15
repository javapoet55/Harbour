CREATE TABLE "QrOpen" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedDay" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "model" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    CONSTRAINT "QrOpen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QrOpen_openedAt_id_idx" ON "QrOpen"("openedAt", "id");

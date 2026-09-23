-- AlterTable
ALTER TABLE "DeliveryPlan" ADD COLUMN     "cardId" TEXT;

-- CreateTable
CREATE TABLE "GreetingCardImage" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "GreetingCardImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GreetingCardImage_momentId_createdAt_idx" ON "GreetingCardImage"("momentId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryPlan" ADD CONSTRAINT "DeliveryPlan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "GreetingCardImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreetingCardImage" ADD CONSTRAINT "GreetingCardImage_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "ImportantMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "pushedConnectionId" TEXT,
ADD COLUMN     "pushedExternalId" TEXT;

-- CreateIndex
CREATE INDEX "CalendarEvent_pushedConnectionId_pushedExternalId_idx" ON "CalendarEvent"("pushedConnectionId", "pushedExternalId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_pushedConnectionId_fkey" FOREIGN KEY ("pushedConnectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;


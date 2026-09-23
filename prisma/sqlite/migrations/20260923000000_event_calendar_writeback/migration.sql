-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'harbor',
    "externalId" TEXT,
    "syncKey" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "pushedConnectionId" TEXT,
    "pushedExternalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_pushedConnectionId_fkey" FOREIGN KEY ("pushedConnectionId") REFERENCES "CalendarConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CalendarEvent" ("allDay", "connectionId", "createdAt", "deletedAt", "endAt", "externalId", "id", "location", "notes", "source", "startAt", "syncKey", "timeZone", "title", "updatedAt", "userId") SELECT "allDay", "connectionId", "createdAt", "deletedAt", "endAt", "externalId", "id", "location", "notes", "source", "startAt", "syncKey", "timeZone", "title", "updatedAt", "userId" FROM "CalendarEvent";
DROP TABLE "CalendarEvent";
ALTER TABLE "new_CalendarEvent" RENAME TO "CalendarEvent";
CREATE UNIQUE INDEX "CalendarEvent_syncKey_key" ON "CalendarEvent"("syncKey");
CREATE INDEX "CalendarEvent_pushedConnectionId_pushedExternalId_idx" ON "CalendarEvent"("pushedConnectionId", "pushedExternalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


CREATE TABLE "ShoppingList" (
"id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL,
"date" TEXT NOT NULL, "timeZone" TEXT NOT NULL, "weekly" BOOLEAN NOT NULL DEFAULT false,
"completedAt" DATETIME, "revision" INTEGER NOT NULL DEFAULT 0,
"generatedFrom" TEXT, "shareToken" TEXT,
"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
CONSTRAINT "ShoppingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "ShoppingList_generatedFrom_key" ON "ShoppingList"("generatedFrom");
CREATE UNIQUE INDEX "ShoppingList_shareToken_key" ON "ShoppingList"("shareToken");
CREATE INDEX "ShoppingList_userId_date_idx" ON "ShoppingList"("userId","date");
CREATE TABLE "ShoppingItem" (
"id" TEXT NOT NULL PRIMARY KEY, "listId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
"quantity" TEXT NOT NULL DEFAULT '1', "size" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
"checked" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL DEFAULT 0,
CONSTRAINT "ShoppingItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "ShoppingItem_listId_sortOrder_idx" ON "ShoppingItem"("listId","sortOrder");

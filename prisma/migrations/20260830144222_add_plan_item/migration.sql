-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT,
    "title" TEXT NOT NULL,
    "targetAmount" INTEGER,
    "order" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    CONSTRAINT "PlanItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlanItem_userId_idx" ON "PlanItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_userId_key_key" ON "PlanItem"("userId", "key");

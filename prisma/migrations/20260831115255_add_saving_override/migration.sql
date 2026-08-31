-- CreateTable
CREATE TABLE "SavingOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "monthKey" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    CONSTRAINT "SavingOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SavingOverride_userId_monthKey_key" ON "SavingOverride"("userId", "monthKey");

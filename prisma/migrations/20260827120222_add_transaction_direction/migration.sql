-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'expense',
    "category" TEXT NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "category", "date", "id", "isFixed", "memo", "userId") SELECT "amount", "category", "date", "id", "isFixed", "memo", "userId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_userId_category_idx" ON "Transaction"("userId", "category");
CREATE INDEX "Transaction_userId_direction_idx" ON "Transaction"("userId", "direction");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

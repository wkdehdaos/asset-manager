-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "currency" TEXT;
ALTER TABLE "Holding" ADD COLUMN "pricedAt" DATETIME;
ALTER TABLE "Holding" ADD COLUMN "quantity" REAL;
ALTER TABLE "Holding" ADD COLUMN "ticker" TEXT;

/*
  Warnings:

  - You are about to drop the column `type` on the `Break` table. All the data in the column will be lost.
  - You are about to drop the column `occured_at` on the `Distraction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Break" DROP COLUMN "type";

-- AlterTable
ALTER TABLE "Distraction" DROP COLUMN "occured_at",
ADD COLUMN     "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "timezone" SET DEFAULT 'UTC';

-- DropEnum
DROP TYPE "BreakType";

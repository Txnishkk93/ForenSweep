-- AlterEnum
ALTER TYPE "EraseMethod" ADD VALUE 'DESTROY';

-- AlterTable
ALTER TABLE "Device"
  ADD COLUMN "supportsCryptoErase" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "supportsSecureErase" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "respondsToCommands" BOOLEAN NOT NULL DEFAULT true;

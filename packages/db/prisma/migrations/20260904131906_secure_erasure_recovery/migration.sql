/*
  Warnings:

  - The `detail` column on the `AuditLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `eraseScope` column on the `Job` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `eraseFileList` column on the `Job` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `standard` column on the `Job` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `scanType` column on the `Job` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `validationNotes` column on the `RecoveredFile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[certificateNumber]` on the table `Certificate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `eventHash` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `canonicalPayload` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `certificateNumber` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hashAlgorithm` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `signatureAlgorithm` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `standard` on the `Certificate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `deviceSnapshot` on the `Certificate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `progressDetail` to the `Job` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('QUEUED', 'DEVICE_PROFILED', 'WAITING_FOR_APPROVAL', 'OVERWRITING', 'SANITIZING', 'CARVING', 'VALIDATING', 'RECONSTRUCTING', 'VERIFYING', 'CERTIFYING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EraseScope" AS ENUM ('WHOLE_DRIVE', 'SPECIFIC_FILES');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('QUICK', 'DEEP');

-- CreateEnum
CREATE TYPE "SanitizationStandard" AS ENUM ('NIST_800_88', 'DOD_5220_22_M');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "eventHash" TEXT NOT NULL,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "signature" TEXT,
DROP COLUMN "detail",
ADD COLUMN     "detail" JSONB;

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "canonicalPayload" JSONB NOT NULL,
ADD COLUMN     "certificateNumber" TEXT NOT NULL,
ADD COLUMN     "hashAlgorithm" TEXT NOT NULL,
ADD COLUMN     "signatureAlgorithm" TEXT NOT NULL,
ADD COLUMN     "verificationDetails" JSONB,
DROP COLUMN "standard",
ADD COLUMN     "standard" "SanitizationStandard" NOT NULL,
DROP COLUMN "deviceSnapshot",
ADD COLUMN     "deviceSnapshot" JSONB NOT NULL,
ALTER COLUMN "pdfPath" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "capabilitySnapshot" JSONB,
ADD COLUMN     "isSystemDisk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mounted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "currentPass" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outputDirectory" TEXT,
ADD COLUMN     "progressDetail" JSONB NOT NULL,
ADD COLUMN     "sourceHash" TEXT,
ADD COLUMN     "stage" "JobStage" NOT NULL DEFAULT 'QUEUED',
ADD COLUMN     "totalPasses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verificationData" JSONB,
DROP COLUMN "eraseScope",
ADD COLUMN     "eraseScope" "EraseScope",
DROP COLUMN "eraseFileList",
ADD COLUMN     "eraseFileList" JSONB,
DROP COLUMN "standard",
ADD COLUMN     "standard" "SanitizationStandard",
DROP COLUMN "scanType",
ADD COLUMN     "scanType" "ScanType";

-- AlterTable
ALTER TABLE "RecoveredFile" ADD COLUMN     "fragmentCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isTruncated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "previewPath" TEXT,
ADD COLUMN     "scoreBreakdown" JSONB,
ADD COLUMN     "sha256" TEXT,
DROP COLUMN "validationNotes",
ADD COLUMN     "validationNotes" JSONB;

-- CreateIndex
CREATE INDEX "AuditLog_eventHash_idx" ON "AuditLog"("eventHash");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certificateNumber_key" ON "Certificate"("certificateNumber");

-- CreateIndex
CREATE INDEX "Device_type_idx" ON "Device"("type");

-- CreateIndex
CREATE INDEX "Device_isSystemDisk_idx" ON "Device"("isSystemDisk");

-- CreateIndex
CREATE INDEX "Job_stage_idx" ON "Job"("stage");

-- CreateIndex
CREATE INDEX "Job_approvalStatus_idx" ON "Job"("approvalStatus");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

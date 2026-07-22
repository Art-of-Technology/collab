-- Phase 3: Secrets Vault Migration
-- Adds encryption fields to Note model and NoteActivityLog for audit trail
-- Also adds new secret note types: ENV_VARS, API_KEYS, CREDENTIALS

-- Add new NoteType values for secrets
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'ENV_VARS';
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'API_KEYS';
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'CREDENTIALS';

-- CreateEnum
CREATE TYPE "NoteActivityAction" AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'REVEAL', 'COPY', 'COPY_ALL', 'EXPORT', 'SHARE', 'UNSHARE', 'PIN', 'UNPIN', 'ACCESS_DENIED');

-- AlterTable - Add secrets vault fields to Note
ALTER TABLE "Note" ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Note" ADD COLUMN "encryptedContent" TEXT;
ALTER TABLE "Note" ADD COLUMN "secretVariables" TEXT;
ALTER TABLE "Note" ADD COLUMN "encryptionVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Note" ADD COLUMN "isRestricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Note" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable - NoteActivityLog for audit trail
CREATE TABLE "NoteActivityLog" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "NoteActivityAction" NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_isEncrypted_idx" ON "Note"("isEncrypted");
CREATE INDEX "Note_isRestricted_idx" ON "Note"("isRestricted");

CREATE INDEX "NoteActivityLog_noteId_idx" ON "NoteActivityLog"("noteId");
CREATE INDEX "NoteActivityLog_userId_idx" ON "NoteActivityLog"("userId");
CREATE INDEX "NoteActivityLog_action_idx" ON "NoteActivityLog"("action");
CREATE INDEX "NoteActivityLog_createdAt_idx" ON "NoteActivityLog"("createdAt");
CREATE INDEX "NoteActivityLog_noteId_createdAt_idx" ON "NoteActivityLog"("noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "NoteActivityLog" ADD CONSTRAINT "NoteActivityLog_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteActivityLog" ADD CONSTRAINT "NoteActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Knowledge System Migration: Note Types, Scopes, and Sharing
-- This migration adds the Knowledge System features to the Notes model

-- Create NoteType enum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'SYSTEM_PROMPT', 'GUIDE', 'README', 'TECH_STACK', 'CODING_STYLE', 'ARCHITECTURE', 'API_DOCS', 'RUNBOOK', 'TROUBLESHOOT', 'MEETING', 'DECISION');

-- Create NoteScope enum
CREATE TYPE "NoteScope" AS ENUM ('PERSONAL', 'SHARED', 'PROJECT', 'WORKSPACE', 'PUBLIC');

-- Create NoteSharePermission enum
CREATE TYPE "NoteSharePermission" AS ENUM ('READ', 'EDIT');

-- Add new columns to Note table
ALTER TABLE "Note" ADD COLUMN "type" "NoteType" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Note" ADD COLUMN "scope" "NoteScope" NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE "Note" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Note" ADD COLUMN "isAiContext" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Note" ADD COLUMN "aiContextPriority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Note" ADD COLUMN "category" TEXT;

-- Migrate existing isPublic data to scope
-- Notes with isPublic=true become WORKSPACE scope
UPDATE "Note" SET "scope" = 'WORKSPACE' WHERE "isPublic" = true;
-- Notes with isPublic=false become PERSONAL scope (already default)

-- Drop the isPublic column after migration
ALTER TABLE "Note" DROP COLUMN "isPublic";

-- Create NoteShare table for personal note sharing
CREATE TABLE "NoteShare" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "NoteSharePermission" NOT NULL DEFAULT 'READ',
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedBy" TEXT NOT NULL,

    CONSTRAINT "NoteShare_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on NoteShare
CREATE UNIQUE INDEX "NoteShare_noteId_userId_key" ON "NoteShare"("noteId", "userId");

-- Create indexes on NoteShare
CREATE INDEX "NoteShare_noteId_idx" ON "NoteShare"("noteId");
CREATE INDEX "NoteShare_userId_idx" ON "NoteShare"("userId");
CREATE INDEX "NoteShare_sharedBy_idx" ON "NoteShare"("sharedBy");

-- Create indexes on Note for new columns
CREATE INDEX "Note_type_idx" ON "Note"("type");
CREATE INDEX "Note_scope_idx" ON "Note"("scope");
CREATE INDEX "Note_projectId_idx" ON "Note"("projectId");
CREATE INDEX "Note_isAiContext_idx" ON "Note"("isAiContext");
CREATE INDEX "Note_category_idx" ON "Note"("category");

-- Add foreign key constraints
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

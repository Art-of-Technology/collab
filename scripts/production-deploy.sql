-- =============================================================================
-- PRODUCTION DEPLOYMENT MIGRATION SCRIPT
-- =============================================================================
-- UAT → Main (Production) Database Migration
-- 
-- This script is IDEMPOTENT — safe to run multiple times.
-- Every statement uses IF NOT EXISTS / column-exists checks.
--
-- IMPORTANT: Run this BEFORE deploying the new code.
-- IMPORTANT: Take a database backup before running this script.
--
-- Execution: psql $DATABASE_URL -f scripts/production-deploy.sql
-- =============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: CREATE NEW ENUMS
-- ============================================================================
-- PostgreSQL doesn't have CREATE TYPE IF NOT EXISTS, so we use DO blocks.

DO $$ BEGIN
  CREATE TYPE "NoteType" AS ENUM (
    'GENERAL', 'SYSTEM_PROMPT', 'GUIDE', 'README', 'TECH_STACK',
    'CODING_STYLE', 'ARCHITECTURE', 'API_DOCS', 'RUNBOOK',
    'TROUBLESHOOT', 'MEETING', 'DECISION',
    'ENV_VARS', 'API_KEYS', 'CREDENTIALS'
  );
EXCEPTION WHEN duplicate_object THEN
  -- Enum exists; ensure the secrets-vault values are present
  BEGIN ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'ENV_VARS'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'API_KEYS'; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'CREDENTIALS'; EXCEPTION WHEN others THEN NULL; END;
END $$;

DO $$ BEGIN
  CREATE TYPE "NoteScope" AS ENUM ('PERSONAL', 'SHARED', 'PROJECT', 'WORKSPACE', 'PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NoteSharePermission" AS ENUM ('READ', 'EDIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NoteActivityAction" AS ENUM (
    'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'REVEAL', 'COPY',
    'COPY_ALL', 'EXPORT', 'SHARE', 'UNSHARE', 'PIN', 'UNPIN', 'ACCESS_DENIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NoteVersionChangeType" AS ENUM ('CREATED', 'EDIT', 'TITLE', 'RESTORE', 'MERGE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CoclawInstanceStatus" AS ENUM ('IDLE', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CoclawMessageStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN RAISE NOTICE 'Phase 1 complete: Enums created/verified'; END $$;

-- ============================================================================
-- PHASE 2: ALTER "Note" TABLE — ZERO DATA LOSS
-- ============================================================================
-- Production Note table currently has: id, title, content, isPublic, isFavorite,
-- authorId, workspaceId, createdAt, updatedAt.
--
-- We need to:
--   1. ADD new columns (with safe defaults)
--   2. MIGRATE isPublic=true → scope='WORKSPACE', isPublic=false → scope='PERSONAL'
--   3. DROP isPublic ONLY AFTER migration

-- Phase 2a: Knowledge System columns (Phase 1 of Knowledge Base)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='type') THEN
    ALTER TABLE "Note" ADD COLUMN "type" "NoteType" NOT NULL DEFAULT 'GENERAL';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='scope') THEN
    ALTER TABLE "Note" ADD COLUMN "scope" "NoteScope" NOT NULL DEFAULT 'PERSONAL';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='projectId') THEN
    ALTER TABLE "Note" ADD COLUMN "projectId" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='isAiContext') THEN
    ALTER TABLE "Note" ADD COLUMN "isAiContext" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='aiContextPriority') THEN
    ALTER TABLE "Note" ADD COLUMN "aiContextPriority" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='category') THEN
    ALTER TABLE "Note" ADD COLUMN "category" TEXT;
  END IF;
END $$;

-- Phase 2b: MIGRATE isPublic → scope (THE CRITICAL DATA MIGRATION)
-- Only run if isPublic column still exists (i.e., not yet migrated)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='isPublic') THEN
    -- Migrate public notes to WORKSPACE scope
    UPDATE "Note" SET "scope" = 'WORKSPACE' WHERE "isPublic" = true;
    -- Private notes stay as PERSONAL (the default)
    RAISE NOTICE 'Migrated isPublic to scope for all notes';
    
    -- NOW drop isPublic — data is preserved in scope column
    ALTER TABLE "Note" DROP COLUMN "isPublic";
    RAISE NOTICE 'Dropped isPublic column (data preserved in scope)';
  ELSE
    RAISE NOTICE 'isPublic already dropped - skipping migration';
  END IF;
END $$;

-- Phase 2c: Pinning fields (Phase 2 of Knowledge Base)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='isPinned') THEN
    ALTER TABLE "Note" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='pinnedAt') THEN
    ALTER TABLE "Note" ADD COLUMN "pinnedAt" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='pinnedBy') THEN
    ALTER TABLE "Note" ADD COLUMN "pinnedBy" TEXT;
  END IF;
END $$;

-- Phase 2d: Secrets Vault fields (Phase 3 of Knowledge Base)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='isEncrypted') THEN
    ALTER TABLE "Note" ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='encryptedContent') THEN
    ALTER TABLE "Note" ADD COLUMN "encryptedContent" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='secretVariables') THEN
    ALTER TABLE "Note" ADD COLUMN "secretVariables" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='encryptionVersion') THEN
    ALTER TABLE "Note" ADD COLUMN "encryptionVersion" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='isRestricted') THEN
    ALTER TABLE "Note" ADD COLUMN "isRestricted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='expiresAt') THEN
    ALTER TABLE "Note" ADD COLUMN "expiresAt" TIMESTAMP(3);
  END IF;
END $$;

-- Phase 2e: Versioning fields (Phase 4 of Knowledge Base)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='version') THEN
    ALTER TABLE "Note" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='versioningEnabled') THEN
    ALTER TABLE "Note" ADD COLUMN "versioningEnabled" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='lastVersionAt') THEN
    ALTER TABLE "Note" ADD COLUMN "lastVersionAt" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='lastVersionBy') THEN
    ALTER TABLE "Note" ADD COLUMN "lastVersionBy" TEXT;
  END IF;
END $$;

-- Phase 2f: Template field (Phase 5 of Knowledge Base)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Note' AND column_name='templateId') THEN
    ALTER TABLE "Note" ADD COLUMN "templateId" TEXT;
  END IF;
END $$;

-- Phase 2g: Note indexes
CREATE INDEX IF NOT EXISTS "Note_type_idx" ON "Note"("type");
CREATE INDEX IF NOT EXISTS "Note_scope_idx" ON "Note"("scope");
CREATE INDEX IF NOT EXISTS "Note_projectId_idx" ON "Note"("projectId");
CREATE INDEX IF NOT EXISTS "Note_isAiContext_idx" ON "Note"("isAiContext");
CREATE INDEX IF NOT EXISTS "Note_isPinned_idx" ON "Note"("isPinned");
CREATE INDEX IF NOT EXISTS "Note_isEncrypted_idx" ON "Note"("isEncrypted");
CREATE INDEX IF NOT EXISTS "Note_isRestricted_idx" ON "Note"("isRestricted");
CREATE INDEX IF NOT EXISTS "Note_version_idx" ON "Note"("version");
CREATE INDEX IF NOT EXISTS "Note_templateId_idx" ON "Note"("templateId");
CREATE INDEX IF NOT EXISTS "Note_category_idx" ON "Note"("category");

-- Phase 2h: Note foreign keys (safe with IF NOT EXISTS on constraint name)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_projectId_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_pinnedBy_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_pinnedBy_fkey"
      FOREIGN KEY ("pinnedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_lastVersionBy_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_lastVersionBy_fkey"
      FOREIGN KEY ("lastVersionBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Phase 2 complete: Note table migrated (isPublic to scope, all new columns added)'; END $$;

-- ============================================================================
-- PHASE 3: CREATE KNOWLEDGE BASE TABLES
-- ============================================================================

-- NoteShare (personal note sharing)
CREATE TABLE IF NOT EXISTS "NoteShare" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "NoteSharePermission" NOT NULL DEFAULT 'READ',
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedBy" TEXT NOT NULL,
    CONSTRAINT "NoteShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NoteShare_noteId_userId_key" ON "NoteShare"("noteId", "userId");
CREATE INDEX IF NOT EXISTS "NoteShare_noteId_idx" ON "NoteShare"("noteId");
CREATE INDEX IF NOT EXISTS "NoteShare_userId_idx" ON "NoteShare"("userId");
CREATE INDEX IF NOT EXISTS "NoteShare_sharedBy_idx" ON "NoteShare"("sharedBy");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteShare_noteId_fkey') THEN
    ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_noteId_fkey"
      FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteShare_userId_fkey') THEN
    ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteShare_sharedBy_fkey') THEN
    ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_sharedBy_fkey"
      FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- NoteActivityLog (audit trail)
CREATE TABLE IF NOT EXISTS "NoteActivityLog" (
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

CREATE INDEX IF NOT EXISTS "NoteActivityLog_noteId_idx" ON "NoteActivityLog"("noteId");
CREATE INDEX IF NOT EXISTS "NoteActivityLog_userId_idx" ON "NoteActivityLog"("userId");
CREATE INDEX IF NOT EXISTS "NoteActivityLog_action_idx" ON "NoteActivityLog"("action");
CREATE INDEX IF NOT EXISTS "NoteActivityLog_createdAt_idx" ON "NoteActivityLog"("createdAt");
CREATE INDEX IF NOT EXISTS "NoteActivityLog_noteId_createdAt_idx" ON "NoteActivityLog"("noteId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteActivityLog_noteId_fkey') THEN
    ALTER TABLE "NoteActivityLog" ADD CONSTRAINT "NoteActivityLog_noteId_fkey"
      FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteActivityLog_userId_fkey') THEN
    ALTER TABLE "NoteActivityLog" ADD CONSTRAINT "NoteActivityLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- NoteVersion (version history)
CREATE TABLE IF NOT EXISTS "NoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "comment" TEXT,
    "changeType" "NoteVersionChangeType" NOT NULL DEFAULT 'EDIT',
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NoteVersion_noteId_version_key" ON "NoteVersion"("noteId", "version");
CREATE INDEX IF NOT EXISTS "NoteVersion_noteId_idx" ON "NoteVersion"("noteId");
CREATE INDEX IF NOT EXISTS "NoteVersion_authorId_idx" ON "NoteVersion"("authorId");
CREATE INDEX IF NOT EXISTS "NoteVersion_createdAt_idx" ON "NoteVersion"("createdAt");
CREATE INDEX IF NOT EXISTS "NoteVersion_noteId_createdAt_idx" ON "NoteVersion"("noteId", "createdAt");
CREATE INDEX IF NOT EXISTS "NoteVersion_changeType_idx" ON "NoteVersion"("changeType");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteVersion_noteId_fkey') THEN
    ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_fkey"
      FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteVersion_authorId_fkey') THEN
    ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- NoteTemplate
CREATE TABLE IF NOT EXISTS "NoteTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "titleTemplate" TEXT NOT NULL,
    "contentTemplate" TEXT NOT NULL,
    "defaultType" "NoteType" NOT NULL DEFAULT 'GENERAL',
    "defaultScope" "NoteScope" NOT NULL DEFAULT 'PERSONAL',
    "defaultTags" TEXT[] DEFAULT '{}',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT,
    "authorId" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NoteTemplate_name_workspaceId_key" ON "NoteTemplate"("name", "workspaceId");
CREATE INDEX IF NOT EXISTS "NoteTemplate_workspaceId_idx" ON "NoteTemplate"("workspaceId");
CREATE INDEX IF NOT EXISTS "NoteTemplate_authorId_idx" ON "NoteTemplate"("authorId");
CREATE INDEX IF NOT EXISTS "NoteTemplate_isBuiltIn_idx" ON "NoteTemplate"("isBuiltIn");
CREATE INDEX IF NOT EXISTS "NoteTemplate_defaultType_idx" ON "NoteTemplate"("defaultType");
CREATE INDEX IF NOT EXISTS "NoteTemplate_order_idx" ON "NoteTemplate"("order");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteTemplate_workspaceId_fkey') THEN
    ALTER TABLE "NoteTemplate" ADD CONSTRAINT "NoteTemplate_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NoteTemplate_authorId_fkey') THEN
    ALTER TABLE "NoteTemplate" ADD CONSTRAINT "NoteTemplate_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Note.templateId FK (depends on NoteTemplate existing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_templateId_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "NoteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Phase 3 complete: Knowledge Base tables created'; END $$;

-- ============================================================================
-- PHASE 4: CREATE AI SYSTEM TABLES
-- ============================================================================

-- AIAgent
CREATE TABLE IF NOT EXISTS "AIAgent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "systemPrompt" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT '{}',
    "personality" TEXT,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIAgent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AIAgent_slug_key" ON "AIAgent"("slug");
CREATE INDEX IF NOT EXISTS "AIAgent_slug_idx" ON "AIAgent"("slug");
CREATE INDEX IF NOT EXISTS "AIAgent_isDefault_idx" ON "AIAgent"("isDefault");
CREATE INDEX IF NOT EXISTS "AIAgent_isActive_idx" ON "AIAgent"("isActive");

-- AIConversation
CREATE TABLE IF NOT EXISTS "AIConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIConversation_userId_idx" ON "AIConversation"("userId");
CREATE INDEX IF NOT EXISTS "AIConversation_workspaceId_idx" ON "AIConversation"("workspaceId");
CREATE INDEX IF NOT EXISTS "AIConversation_agentId_idx" ON "AIConversation"("agentId");
CREATE INDEX IF NOT EXISTS "AIConversation_isArchived_idx" ON "AIConversation"("isArchived");
CREATE INDEX IF NOT EXISTS "AIConversation_userId_workspaceId_idx" ON "AIConversation"("userId", "workspaceId");
CREATE INDEX IF NOT EXISTS "AIConversation_createdAt_idx" ON "AIConversation"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIConversation_userId_fkey') THEN
    ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIConversation_workspaceId_fkey') THEN
    ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIConversation_agentId_fkey') THEN
    ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AIMessage
CREATE TABLE IF NOT EXISTS "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");
CREATE INDEX IF NOT EXISTS "AIMessage_agentId_idx" ON "AIMessage"("agentId");
CREATE INDEX IF NOT EXISTS "AIMessage_userId_idx" ON "AIMessage"("userId");
CREATE INDEX IF NOT EXISTS "AIMessage_createdAt_idx" ON "AIMessage"("createdAt");
CREATE INDEX IF NOT EXISTS "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIMessage_conversationId_fkey') THEN
    ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIMessage_agentId_fkey') THEN
    ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIMessage_userId_fkey') THEN
    ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- DashboardLayout
CREATE TABLE IF NOT EXISTS "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DashboardLayout_userId_workspaceId_key" ON "DashboardLayout"("userId", "workspaceId");
CREATE INDEX IF NOT EXISTS "DashboardLayout_userId_idx" ON "DashboardLayout"("userId");
CREATE INDEX IF NOT EXISTS "DashboardLayout_workspaceId_idx" ON "DashboardLayout"("workspaceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DashboardLayout_userId_fkey') THEN
    ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DashboardLayout_workspaceId_fkey') THEN
    ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AIUserPreference
CREATE TABLE IF NOT EXISTS "AIUserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "defaultAgentId" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "contextSharing" BOOLEAN NOT NULL DEFAULT true,
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIUserPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AIUserPreference_userId_workspaceId_key" ON "AIUserPreference"("userId", "workspaceId");
CREATE INDEX IF NOT EXISTS "AIUserPreference_userId_idx" ON "AIUserPreference"("userId");
CREATE INDEX IF NOT EXISTS "AIUserPreference_workspaceId_idx" ON "AIUserPreference"("workspaceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIUserPreference_userId_fkey') THEN
    ALTER TABLE "AIUserPreference" ADD CONSTRAINT "AIUserPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIUserPreference_workspaceId_fkey') THEN
    ALTER TABLE "AIUserPreference" ADD CONSTRAINT "AIUserPreference_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Phase 4 complete: AI System tables created'; END $$;

-- ============================================================================
-- PHASE 5: CREATE COCLAW TABLES
-- ============================================================================

-- CoclawInstance
CREATE TABLE IF NOT EXISTS "CoclawInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "CoclawInstanceStatus" NOT NULL DEFAULT 'IDLE',
    "processId" INTEGER,
    "port" INTEGER,
    "config" JSONB,
    "apiKeySource" TEXT,
    "providerId" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoclawInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoclawInstance_userId_workspaceId_key" ON "CoclawInstance"("userId", "workspaceId");
CREATE INDEX IF NOT EXISTS "CoclawInstance_userId_idx" ON "CoclawInstance"("userId");
CREATE INDEX IF NOT EXISTS "CoclawInstance_workspaceId_idx" ON "CoclawInstance"("workspaceId");
CREATE INDEX IF NOT EXISTS "CoclawInstance_status_idx" ON "CoclawInstance"("status");
CREATE INDEX IF NOT EXISTS "CoclawInstance_lastActiveAt_idx" ON "CoclawInstance"("lastActiveAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawInstance_userId_fkey') THEN
    ALTER TABLE "CoclawInstance" ADD CONSTRAINT "CoclawInstance_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawInstance_workspaceId_fkey') THEN
    ALTER TABLE "CoclawInstance" ADD CONSTRAINT "CoclawInstance_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CoclawUsageLog
CREATE TABLE IF NOT EXISTS "CoclawUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "apiKeySource" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoclawUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoclawUsageLog_userId_workspaceId_date_key" ON "CoclawUsageLog"("userId", "workspaceId", "date");
CREATE INDEX IF NOT EXISTS "CoclawUsageLog_userId_idx" ON "CoclawUsageLog"("userId");
CREATE INDEX IF NOT EXISTS "CoclawUsageLog_workspaceId_idx" ON "CoclawUsageLog"("workspaceId");
CREATE INDEX IF NOT EXISTS "CoclawUsageLog_date_idx" ON "CoclawUsageLog"("date");
CREATE INDEX IF NOT EXISTS "CoclawUsageLog_apiKeySource_idx" ON "CoclawUsageLog"("apiKeySource");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawUsageLog_userId_fkey') THEN
    ALTER TABLE "CoclawUsageLog" ADD CONSTRAINT "CoclawUsageLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawUsageLog_workspaceId_fkey') THEN
    ALTER TABLE "CoclawUsageLog" ADD CONSTRAINT "CoclawUsageLog_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CoclawChannelConfig
CREATE TABLE IF NOT EXISTS "CoclawChannelConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoclawChannelConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoclawChannelConfig_userId_workspaceId_channelType_key" ON "CoclawChannelConfig"("userId", "workspaceId", "channelType");
CREATE INDEX IF NOT EXISTS "CoclawChannelConfig_userId_idx" ON "CoclawChannelConfig"("userId");
CREATE INDEX IF NOT EXISTS "CoclawChannelConfig_workspaceId_idx" ON "CoclawChannelConfig"("workspaceId");
CREATE INDEX IF NOT EXISTS "CoclawChannelConfig_channelType_idx" ON "CoclawChannelConfig"("channelType");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawChannelConfig_userId_fkey') THEN
    ALTER TABLE "CoclawChannelConfig" ADD CONSTRAINT "CoclawChannelConfig_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawChannelConfig_workspaceId_fkey') THEN
    ALTER TABLE "CoclawChannelConfig" ADD CONSTRAINT "CoclawChannelConfig_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CoclawChannelMessage
CREATE TABLE IF NOT EXISTS "CoclawChannelMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "CoclawMessageStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoclawChannelMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CoclawChannelMessage_userId_workspaceId_status_idx" ON "CoclawChannelMessage"("userId", "workspaceId", "status");
CREATE INDEX IF NOT EXISTS "CoclawChannelMessage_userId_status_idx" ON "CoclawChannelMessage"("userId", "status");
CREATE INDEX IF NOT EXISTS "CoclawChannelMessage_conversationId_idx" ON "CoclawChannelMessage"("conversationId");
CREATE INDEX IF NOT EXISTS "CoclawChannelMessage_createdAt_idx" ON "CoclawChannelMessage"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawChannelMessage_userId_fkey') THEN
    ALTER TABLE "CoclawChannelMessage" ADD CONSTRAINT "CoclawChannelMessage_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoclawChannelMessage_workspaceId_fkey') THEN
    ALTER TABLE "CoclawChannelMessage" ADD CONSTRAINT "CoclawChannelMessage_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Phase 5 complete: Coclaw tables created'; END $$;

-- ============================================================================
-- PHASE 6: ALTER BoardItemActivity — STATUS FK TRACKING
-- ============================================================================
-- The IssueActivity model maps to "BoardItemActivity" table (@@map)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='BoardItemActivity' AND column_name='oldStatusId') THEN
    ALTER TABLE "BoardItemActivity" ADD COLUMN "oldStatusId" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='BoardItemActivity' AND column_name='newStatusId') THEN
    ALTER TABLE "BoardItemActivity" ADD COLUMN "newStatusId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BoardItemActivity_oldStatusId_idx" ON "BoardItemActivity"("oldStatusId");
CREATE INDEX IF NOT EXISTS "BoardItemActivity_newStatusId_idx" ON "BoardItemActivity"("newStatusId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BoardItemActivity_oldStatusId_fkey') THEN
    ALTER TABLE "BoardItemActivity" ADD CONSTRAINT "BoardItemActivity_oldStatusId_fkey"
      FOREIGN KEY ("oldStatusId") REFERENCES "ProjectStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BoardItemActivity_newStatusId_fkey') THEN
    ALTER TABLE "BoardItemActivity" ADD CONSTRAINT "BoardItemActivity_newStatusId_fkey"
      FOREIGN KEY ("newStatusId") REFERENCES "ProjectStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Phase 6 complete: BoardItemActivity status FKs added'; END $$;

-- ============================================================================
-- PHASE 7: VERIFICATION QUERIES
-- ============================================================================
-- These SELECT statements verify the migration completed correctly.
-- They will print counts — review them to confirm success.

-- Verify Note columns exist and data preserved
SELECT
  COUNT(*) as total_notes,
  COUNT(*) FILTER (WHERE "scope" = 'WORKSPACE') as workspace_scope,
  COUNT(*) FILTER (WHERE "scope" = 'PERSONAL') as personal_scope,
  COUNT(*) FILTER (WHERE "scope" = 'PROJECT') as project_scope
FROM "Note";

-- Verify no isPublic column remains
SELECT COUNT(*) as isPublic_still_exists
FROM information_schema.columns
WHERE table_name = 'Note' AND column_name = 'isPublic';

-- Verify new tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'NoteShare', 'NoteActivityLog', 'NoteVersion', 'NoteTemplate',
  'AIAgent', 'AIConversation', 'AIMessage', 'DashboardLayout', 'AIUserPreference',
  'CoclawInstance', 'CoclawUsageLog', 'CoclawChannelConfig', 'CoclawChannelMessage'
)
ORDER BY table_name;

-- Verify BoardItemActivity has new columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'BoardItemActivity'
AND column_name IN ('oldStatusId', 'newStatusId');

DO $$ BEGIN
  RAISE NOTICE '=== MIGRATION COMPLETE ===';
  RAISE NOTICE 'Review the verification query results above.';
  RAISE NOTICE 'Expected: 0 for isPublic_still_exists, 13 tables in new tables list.';
END $$;

COMMIT;

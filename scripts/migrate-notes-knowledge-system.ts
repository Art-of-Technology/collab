/**
 * Migration Script: Notes Knowledge System (Phases 1-4)
 *
 * This script safely migrates existing notes to the new Knowledge System schema.
 * It handles:
 * - Phase 1: NoteType, NoteScope enums, isPublic → scope migration
 * - Phase 2: Pinning fields (isPinned, pinnedAt, pinnedBy)
 * - Phase 3: Secrets Vault fields (encryption, activity logging)
 * - Phase 4: Versioning fields (version, NoteVersion table)
 *
 * Run with: npx tsx scripts/migrate-notes-knowledge-system.ts
 *
 * Options:
 *   --dry-run     Preview changes without applying them
 *   --skip-schema Skip schema changes (only run data migration)
 *   --force       Skip confirmation prompts
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipSchema = args.includes('--skip-schema');
const force = args.includes('--force');

interface MigrationStats {
  notesTotal: number;
  notesMigrated: number;
  notesSkipped: number;
  notesErrors: number;
  isPublicTrueCount: number;
  isPublicFalseCount: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function prompt(question: string): Promise<boolean> {
  if (force) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question + ' (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      );
    `;
    return result[0]?.exists ?? false;
  } catch (error) {
    console.error(`Error checking column ${tableName}.${columnName}:`, error);
    return false;
  }
}

async function checkEnumExists(enumName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM pg_type
        WHERE typname = ${enumName}
      );
    `;
    return result[0]?.exists ?? false;
  } catch (error) {
    console.error(`Error checking enum ${enumName}:`, error);
    return false;
  }
}

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      );
    `;
    return result[0]?.exists ?? false;
  } catch (error) {
    console.error(`Error checking table ${tableName}:`, error);
    return false;
  }
}

async function checkEnumValue(enumName: string, value: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = ${enumName})
        AND enumlabel = ${value}
      );
    `;
    return result[0]?.exists ?? false;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// PHASE 1: Knowledge System (Types, Scopes, Sharing)
// ============================================================================

async function migratePhase1Schema(): Promise<void> {
  console.log('\n--- Phase 1: Knowledge System Schema ---\n');

  // Create NoteType enum
  const noteTypeExists = await checkEnumExists('NoteType');
  if (!noteTypeExists) {
    console.log('Creating NoteType enum...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TYPE "NoteType" AS ENUM (
          'GENERAL', 'SYSTEM_PROMPT', 'GUIDE', 'README', 'TECH_STACK',
          'CODING_STYLE', 'ARCHITECTURE', 'API_DOCS', 'RUNBOOK',
          'TROUBLESHOOT', 'MEETING', 'DECISION'
        )
      `;
    }
    console.log('  ✓ NoteType enum created');
  } else {
    console.log('  ✓ NoteType enum already exists');
  }

  // Create NoteScope enum
  const noteScopeExists = await checkEnumExists('NoteScope');
  if (!noteScopeExists) {
    console.log('Creating NoteScope enum...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TYPE "NoteScope" AS ENUM ('PERSONAL', 'SHARED', 'PROJECT', 'WORKSPACE', 'PUBLIC')
      `;
    }
    console.log('  ✓ NoteScope enum created');
  } else {
    console.log('  ✓ NoteScope enum already exists');
  }

  // Create NoteSharePermission enum
  const noteSharePermExists = await checkEnumExists('NoteSharePermission');
  if (!noteSharePermExists) {
    console.log('Creating NoteSharePermission enum...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TYPE "NoteSharePermission" AS ENUM ('READ', 'EDIT')
      `;
    }
    console.log('  ✓ NoteSharePermission enum created');
  } else {
    console.log('  ✓ NoteSharePermission enum already exists');
  }

  // Add type column
  const typeExists = await checkColumnExists('Note', 'type');
  if (!typeExists) {
    console.log('Adding type column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "type" "NoteType" NOT NULL DEFAULT 'GENERAL'`;
      await prisma.$executeRaw`CREATE INDEX "Note_type_idx" ON "Note"("type")`;
    }
    console.log('  ✓ type column added');
  } else {
    console.log('  ✓ type column already exists');
  }

  // Add scope column
  const scopeExists = await checkColumnExists('Note', 'scope');
  if (!scopeExists) {
    console.log('Adding scope column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "scope" "NoteScope" NOT NULL DEFAULT 'PERSONAL'`;
      await prisma.$executeRaw`CREATE INDEX "Note_scope_idx" ON "Note"("scope")`;
    }
    console.log('  ✓ scope column added');
  } else {
    console.log('  ✓ scope column already exists');
  }

  // Add projectId column
  const projectIdExists = await checkColumnExists('Note', 'projectId');
  if (!projectIdExists) {
    console.log('Adding projectId column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "projectId" TEXT`;
      await prisma.$executeRaw`CREATE INDEX "Note_projectId_idx" ON "Note"("projectId")`;
      await prisma.$executeRaw`
        ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      `;
    }
    console.log('  ✓ projectId column added');
  } else {
    console.log('  ✓ projectId column already exists');
  }

  // Add isAiContext column
  const isAiContextExists = await checkColumnExists('Note', 'isAiContext');
  if (!isAiContextExists) {
    console.log('Adding isAiContext column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "isAiContext" BOOLEAN NOT NULL DEFAULT false`;
      await prisma.$executeRaw`CREATE INDEX "Note_isAiContext_idx" ON "Note"("isAiContext")`;
    }
    console.log('  ✓ isAiContext column added');
  } else {
    console.log('  ✓ isAiContext column already exists');
  }

  // Add aiContextPriority column
  const aiContextPriorityExists = await checkColumnExists('Note', 'aiContextPriority');
  if (!aiContextPriorityExists) {
    console.log('Adding aiContextPriority column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "aiContextPriority" INTEGER NOT NULL DEFAULT 0`;
    }
    console.log('  ✓ aiContextPriority column added');
  } else {
    console.log('  ✓ aiContextPriority column already exists');
  }

  // Create NoteShare table
  const noteShareExists = await checkTableExists('NoteShare');
  if (!noteShareExists) {
    console.log('Creating NoteShare table...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TABLE "NoteShare" (
          "id" TEXT NOT NULL,
          "noteId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "permission" "NoteSharePermission" NOT NULL DEFAULT 'READ',
          "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "sharedBy" TEXT NOT NULL,
          CONSTRAINT "NoteShare_pkey" PRIMARY KEY ("id")
        )
      `;
      await prisma.$executeRaw`CREATE UNIQUE INDEX "NoteShare_noteId_userId_key" ON "NoteShare"("noteId", "userId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteShare_noteId_idx" ON "NoteShare"("noteId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteShare_userId_idx" ON "NoteShare"("userId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteShare_sharedBy_idx" ON "NoteShare"("sharedBy")`;
      await prisma.$executeRaw`
        ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_noteId_fkey"
        FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
      await prisma.$executeRaw`
        ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
      await prisma.$executeRaw`
        ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_sharedBy_fkey"
        FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
    }
    console.log('  ✓ NoteShare table created');
  } else {
    console.log('  ✓ NoteShare table already exists');
  }
}

async function migratePhase1Data(): Promise<MigrationStats> {
  console.log('\n--- Phase 1: Data Migration (isPublic → scope) ---\n');

  const stats: MigrationStats = {
    notesTotal: 0,
    notesMigrated: 0,
    notesSkipped: 0,
    notesErrors: 0,
    isPublicTrueCount: 0,
    isPublicFalseCount: 0
  };

  // Check if isPublic column still exists
  const isPublicExists = await checkColumnExists('Note', 'isPublic');
  if (!isPublicExists) {
    console.log('isPublic column does not exist - migration may have already been completed');
    console.log('Checking current note scopes...\n');

    // Get current scope distribution
    const scopeCounts = await prisma.$queryRaw<Array<{ scope: string; count: bigint }>>`
      SELECT "scope", COUNT(*) as count FROM "Note" GROUP BY "scope"
    `;

    console.log('Current scope distribution:');
    for (const row of scopeCounts) {
      console.log(`  ${row.scope}: ${row.count}`);
    }

    return stats;
  }

  // Get counts for isPublic values
  const isPublicCounts = await prisma.$queryRaw<Array<{ isPublic: boolean; count: bigint }>>`
    SELECT "isPublic", COUNT(*) as count FROM "Note" GROUP BY "isPublic"
  `;

  for (const row of isPublicCounts) {
    if (row.isPublic) {
      stats.isPublicTrueCount = Number(row.count);
    } else {
      stats.isPublicFalseCount = Number(row.count);
    }
  }

  stats.notesTotal = stats.isPublicTrueCount + stats.isPublicFalseCount;

  console.log(`Notes with isPublic=true (will become WORKSPACE): ${stats.isPublicTrueCount}`);
  console.log(`Notes with isPublic=false (will stay PERSONAL): ${stats.isPublicFalseCount}`);
  console.log(`Total notes: ${stats.notesTotal}\n`);

  if (stats.notesTotal === 0) {
    console.log('No notes to migrate.');
    return stats;
  }

  if (isDryRun) {
    console.log('[DRY RUN] Would migrate notes and drop isPublic column');
    return stats;
  }

  // Migrate isPublic=true to WORKSPACE scope
  if (stats.isPublicTrueCount > 0) {
    console.log('Migrating public notes to WORKSPACE scope...');
    await prisma.$executeRaw`UPDATE "Note" SET "scope" = 'WORKSPACE' WHERE "isPublic" = true`;
    stats.notesMigrated += stats.isPublicTrueCount;
    console.log(`  ✓ ${stats.isPublicTrueCount} notes migrated to WORKSPACE`);
  }

  // Notes with isPublic=false already have PERSONAL as default
  stats.notesSkipped = stats.isPublicFalseCount;
  console.log(`  ✓ ${stats.isPublicFalseCount} notes kept as PERSONAL (default)`);

  // Drop isPublic column
  console.log('\nDropping isPublic column...');
  await prisma.$executeRaw`ALTER TABLE "Note" DROP COLUMN "isPublic"`;
  console.log('  ✓ isPublic column dropped');

  return stats;
}

// ============================================================================
// PHASE 2: Note Pinning
// ============================================================================

async function migratePhase2Schema(): Promise<void> {
  console.log('\n--- Phase 2: Note Pinning Schema ---\n');

  // Add isPinned column
  const isPinnedExists = await checkColumnExists('Note', 'isPinned');
  if (!isPinnedExists) {
    console.log('Adding isPinned column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false`;
      await prisma.$executeRaw`CREATE INDEX "Note_isPinned_idx" ON "Note"("isPinned")`;
    }
    console.log('  ✓ isPinned column added');
  } else {
    console.log('  ✓ isPinned column already exists');
  }

  // Add pinnedAt column
  const pinnedAtExists = await checkColumnExists('Note', 'pinnedAt');
  if (!pinnedAtExists) {
    console.log('Adding pinnedAt column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "pinnedAt" TIMESTAMP(3)`;
    }
    console.log('  ✓ pinnedAt column added');
  } else {
    console.log('  ✓ pinnedAt column already exists');
  }

  // Add pinnedBy column
  const pinnedByExists = await checkColumnExists('Note', 'pinnedBy');
  if (!pinnedByExists) {
    console.log('Adding pinnedBy column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "pinnedBy" TEXT`;
      await prisma.$executeRaw`
        ALTER TABLE "Note" ADD CONSTRAINT "Note_pinnedBy_fkey"
        FOREIGN KEY ("pinnedBy") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      `;
    }
    console.log('  ✓ pinnedBy column added');
  } else {
    console.log('  ✓ pinnedBy column already exists');
  }
}

// ============================================================================
// PHASE 3: Secrets Vault
// ============================================================================

async function migratePhase3Schema(): Promise<void> {
  console.log('\n--- Phase 3: Secrets Vault Schema ---\n');

  // Add secret NoteType values
  const envVarsExists = await checkEnumValue('NoteType', 'ENV_VARS');
  if (!envVarsExists) {
    console.log('Adding secret NoteType values...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'ENV_VARS'`;
      await prisma.$executeRaw`ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'API_KEYS'`;
      await prisma.$executeRaw`ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'CREDENTIALS'`;
    }
    console.log('  ✓ Secret NoteType values added');
  } else {
    console.log('  ✓ Secret NoteType values already exist');
  }

  // Create NoteActivityAction enum
  const noteActivityActionExists = await checkEnumExists('NoteActivityAction');
  if (!noteActivityActionExists) {
    console.log('Creating NoteActivityAction enum...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TYPE "NoteActivityAction" AS ENUM (
          'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'REVEAL', 'COPY',
          'COPY_ALL', 'EXPORT', 'SHARE', 'UNSHARE', 'PIN', 'UNPIN', 'ACCESS_DENIED'
        )
      `;
    }
    console.log('  ✓ NoteActivityAction enum created');
  } else {
    console.log('  ✓ NoteActivityAction enum already exists');
  }

  // Add isEncrypted column
  const isEncryptedExists = await checkColumnExists('Note', 'isEncrypted');
  if (!isEncryptedExists) {
    console.log('Adding isEncrypted column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false`;
      await prisma.$executeRaw`CREATE INDEX "Note_isEncrypted_idx" ON "Note"("isEncrypted")`;
    }
    console.log('  ✓ isEncrypted column added');
  } else {
    console.log('  ✓ isEncrypted column already exists');
  }

  // Add encryptedContent column
  const encryptedContentExists = await checkColumnExists('Note', 'encryptedContent');
  if (!encryptedContentExists) {
    console.log('Adding encryptedContent column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "encryptedContent" TEXT`;
    }
    console.log('  ✓ encryptedContent column added');
  } else {
    console.log('  ✓ encryptedContent column already exists');
  }

  // Add secretVariables column
  const secretVariablesExists = await checkColumnExists('Note', 'secretVariables');
  if (!secretVariablesExists) {
    console.log('Adding secretVariables column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "secretVariables" TEXT`;
    }
    console.log('  ✓ secretVariables column added');
  } else {
    console.log('  ✓ secretVariables column already exists');
  }

  // Add encryptionVersion column
  const encryptionVersionExists = await checkColumnExists('Note', 'encryptionVersion');
  if (!encryptionVersionExists) {
    console.log('Adding encryptionVersion column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "encryptionVersion" INTEGER NOT NULL DEFAULT 1`;
    }
    console.log('  ✓ encryptionVersion column added');
  } else {
    console.log('  ✓ encryptionVersion column already exists');
  }

  // Add isRestricted column
  const isRestrictedExists = await checkColumnExists('Note', 'isRestricted');
  if (!isRestrictedExists) {
    console.log('Adding isRestricted column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "isRestricted" BOOLEAN NOT NULL DEFAULT false`;
      await prisma.$executeRaw`CREATE INDEX "Note_isRestricted_idx" ON "Note"("isRestricted")`;
    }
    console.log('  ✓ isRestricted column added');
  } else {
    console.log('  ✓ isRestricted column already exists');
  }

  // Add expiresAt column
  const expiresAtExists = await checkColumnExists('Note', 'expiresAt');
  if (!expiresAtExists) {
    console.log('Adding expiresAt column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "expiresAt" TIMESTAMP(3)`;
    }
    console.log('  ✓ expiresAt column added');
  } else {
    console.log('  ✓ expiresAt column already exists');
  }

  // Create NoteActivityLog table
  const noteActivityLogExists = await checkTableExists('NoteActivityLog');
  if (!noteActivityLogExists) {
    console.log('Creating NoteActivityLog table...');
    if (!isDryRun) {
      await prisma.$executeRaw`
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
        )
      `;
      await prisma.$executeRaw`CREATE INDEX "NoteActivityLog_noteId_idx" ON "NoteActivityLog"("noteId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteActivityLog_userId_idx" ON "NoteActivityLog"("userId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteActivityLog_action_idx" ON "NoteActivityLog"("action")`;
      await prisma.$executeRaw`CREATE INDEX "NoteActivityLog_createdAt_idx" ON "NoteActivityLog"("createdAt")`;
      await prisma.$executeRaw`CREATE INDEX "NoteActivityLog_noteId_createdAt_idx" ON "NoteActivityLog"("noteId", "createdAt")`;
      await prisma.$executeRaw`
        ALTER TABLE "NoteActivityLog" ADD CONSTRAINT "NoteActivityLog_noteId_fkey"
        FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
      await prisma.$executeRaw`
        ALTER TABLE "NoteActivityLog" ADD CONSTRAINT "NoteActivityLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
    }
    console.log('  ✓ NoteActivityLog table created');
  } else {
    console.log('  ✓ NoteActivityLog table already exists');
  }
}

// ============================================================================
// PHASE 4: Note Versioning
// ============================================================================

async function migratePhase4Schema(): Promise<void> {
  console.log('\n--- Phase 4: Note Versioning Schema ---\n');

  // Create NoteVersionChangeType enum
  const noteVersionChangeTypeExists = await checkEnumExists('NoteVersionChangeType');
  if (!noteVersionChangeTypeExists) {
    console.log('Creating NoteVersionChangeType enum...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TYPE "NoteVersionChangeType" AS ENUM (
          'CREATED', 'EDIT', 'TITLE', 'RESTORE', 'MERGE'
        )
      `;
    }
    console.log('  ✓ NoteVersionChangeType enum created');
  } else {
    console.log('  ✓ NoteVersionChangeType enum already exists');
  }

  // Add version column
  const versionExists = await checkColumnExists('Note', 'version');
  if (!versionExists) {
    console.log('Adding version column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1`;
      await prisma.$executeRaw`CREATE INDEX "Note_version_idx" ON "Note"("version")`;
    }
    console.log('  ✓ version column added');
  } else {
    console.log('  ✓ version column already exists');
  }

  // Add versioningEnabled column
  const versioningEnabledExists = await checkColumnExists('Note', 'versioningEnabled');
  if (!versioningEnabledExists) {
    console.log('Adding versioningEnabled column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "versioningEnabled" BOOLEAN NOT NULL DEFAULT true`;
    }
    console.log('  ✓ versioningEnabled column added');
  } else {
    console.log('  ✓ versioningEnabled column already exists');
  }

  // Add lastVersionAt column
  const lastVersionAtExists = await checkColumnExists('Note', 'lastVersionAt');
  if (!lastVersionAtExists) {
    console.log('Adding lastVersionAt column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "lastVersionAt" TIMESTAMP(3)`;
    }
    console.log('  ✓ lastVersionAt column added');
  } else {
    console.log('  ✓ lastVersionAt column already exists');
  }

  // Add lastVersionBy column
  const lastVersionByExists = await checkColumnExists('Note', 'lastVersionBy');
  if (!lastVersionByExists) {
    console.log('Adding lastVersionBy column to Note...');
    if (!isDryRun) {
      await prisma.$executeRaw`ALTER TABLE "Note" ADD COLUMN "lastVersionBy" TEXT`;
      await prisma.$executeRaw`
        ALTER TABLE "Note" ADD CONSTRAINT "Note_lastVersionBy_fkey"
        FOREIGN KEY ("lastVersionBy") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      `;
    }
    console.log('  ✓ lastVersionBy column added');
  } else {
    console.log('  ✓ lastVersionBy column already exists');
  }

  // Create NoteVersion table
  const noteVersionExists = await checkTableExists('NoteVersion');
  if (!noteVersionExists) {
    console.log('Creating NoteVersion table...');
    if (!isDryRun) {
      await prisma.$executeRaw`
        CREATE TABLE "NoteVersion" (
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
        )
      `;
      await prisma.$executeRaw`CREATE UNIQUE INDEX "NoteVersion_noteId_version_key" ON "NoteVersion"("noteId", "version")`;
      await prisma.$executeRaw`CREATE INDEX "NoteVersion_noteId_idx" ON "NoteVersion"("noteId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteVersion_authorId_idx" ON "NoteVersion"("authorId")`;
      await prisma.$executeRaw`CREATE INDEX "NoteVersion_createdAt_idx" ON "NoteVersion"("createdAt")`;
      await prisma.$executeRaw`CREATE INDEX "NoteVersion_noteId_createdAt_idx" ON "NoteVersion"("noteId", "createdAt")`;
      await prisma.$executeRaw`CREATE INDEX "NoteVersion_changeType_idx" ON "NoteVersion"("changeType")`;
      await prisma.$executeRaw`
        ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_fkey"
        FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
      await prisma.$executeRaw`
        ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
    }
    console.log('  ✓ NoteVersion table created');
  } else {
    console.log('  ✓ NoteVersion table already exists');
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('  Notes Knowledge System Migration (Phases 1-4)');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n[DRY RUN MODE] No changes will be applied.\n');
  }

  // Get initial note count
  const noteCount = await prisma.note.count();
  console.log(`\nTotal notes in database: ${noteCount}`);

  // Confirm before proceeding
  if (!isDryRun && noteCount > 0) {
    const proceed = await prompt('\nThis will modify the database schema and data. Continue?');
    if (!proceed) {
      console.log('Migration cancelled.');
      return;
    }
  }

  if (!skipSchema) {
    // Phase 1 Schema
    await migratePhase1Schema();

    // Phase 2 Schema
    await migratePhase2Schema();

    // Phase 3 Schema
    await migratePhase3Schema();

    // Phase 4 Schema
    await migratePhase4Schema();
  } else {
    console.log('\n[SKIPPING SCHEMA CHANGES]');
  }

  // Phase 1 Data Migration (isPublic → scope)
  const stats = await migratePhase1Data();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  Migration Summary');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n[DRY RUN] No changes were applied.');
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration completed successfully!');
    console.log(`\nNotes processed: ${stats.notesTotal}`);
    console.log(`  Migrated to WORKSPACE: ${stats.isPublicTrueCount}`);
    console.log(`  Kept as PERSONAL: ${stats.isPublicFalseCount}`);
  }

  // Verify final state
  console.log('\n--- Final State Verification ---\n');

  const scopeCounts = await prisma.$queryRaw<Array<{ scope: string; count: bigint }>>`
    SELECT "scope", COUNT(*) as count FROM "Note" GROUP BY "scope" ORDER BY "scope"
  `;

  console.log('Note scope distribution:');
  for (const row of scopeCounts) {
    console.log(`  ${row.scope}: ${row.count}`);
  }

  const typeCounts = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
    SELECT "type", COUNT(*) as count FROM "Note" GROUP BY "type" ORDER BY count DESC
  `;

  console.log('\nNote type distribution:');
  for (const row of typeCounts) {
    console.log(`  ${row.type}: ${row.count}`);
  }

  // Check NoteVersion table
  const versionTableExists = await checkTableExists('NoteVersion');
  if (versionTableExists) {
    const versionCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "NoteVersion"
    `;
    console.log(`\nNote versions: ${versionCount[0]?.count || 0}`);
  }
}

main()
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

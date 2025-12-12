/**
 * Production-Ready Migration: BoardItemActivity → IssueActivity
 *
 * This script safely migrates the BoardItemActivity table to work with
 * the unified Issue model while preserving all historical activity data.
 *
 * Run with: npx tsx scripts/migrate-to-issue-activity.ts
 *
 * Safe to run multiple times (idempotent)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{exists: boolean}>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${tableName} AND column_name = ${columnName}
    );
  `;
  return result[0]?.exists ?? false;
}

async function main() {
  console.log('==============================================');
  console.log('  BoardItemActivity → IssueActivity Migration');
  console.log('==============================================\n');

  // Step 1: Check current state
  console.log('Step 1: Analyzing current state...');

  const totalBefore = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity"
  `;
  console.log(`  Total BoardItemActivity records: ${Number(totalBefore[0]?.cnt || 0)}`);

  if (Number(totalBefore[0]?.cnt || 0) === 0) {
    console.log('\n⚠️  No records to migrate. Exiting.');
    return;
  }

  // Step 2: Check if projectId column exists
  console.log('\nStep 2: Checking projectId column...');
  const hasProjectId = await checkColumnExists('BoardItemActivity', 'projectId');

  if (!hasProjectId) {
    console.log('  Adding projectId column...');
    await prisma.$executeRaw`
      ALTER TABLE "BoardItemActivity" ADD COLUMN "projectId" TEXT
    `;
    console.log('  ✓ projectId column added');
  } else {
    console.log('  ✓ projectId column already exists');
  }

  // Step 3: Count records needing projectId update
  const needsProjectId = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity" WHERE "projectId" IS NULL
  `;
  console.log(`\nStep 3: Records needing projectId: ${Number(needsProjectId[0]?.cnt || 0)}`);

  if (Number(needsProjectId[0]?.cnt || 0) > 0) {
    // Step 4: Update projectId from Issue table
    console.log('\nStep 4: Populating projectId from Issue table...');

    const updated = await prisma.$executeRaw`
      UPDATE "BoardItemActivity" b
      SET "projectId" = i."projectId"
      FROM "Issue" i
      WHERE b."itemId" = i."id"
        AND b."projectId" IS NULL
        AND i."projectId" IS NOT NULL
    `;
    console.log(`  ✓ Updated ${updated} records with projectId from Issue`);

    // Step 5: Try boardId as fallback for any remaining records
    const stillNeedsProjectId = await prisma.$queryRaw<Array<{cnt: bigint}>>`
      SELECT COUNT(*) as cnt FROM "BoardItemActivity"
      WHERE "projectId" IS NULL AND "boardId" IS NOT NULL
    `;

    if (Number(stillNeedsProjectId[0]?.cnt || 0) > 0) {
      console.log('\nStep 5: Using boardId as fallback for remaining records...');
      const fallbackUpdated = await prisma.$executeRaw`
        UPDATE "BoardItemActivity"
        SET "projectId" = "boardId"
        WHERE "projectId" IS NULL AND "boardId" IS NOT NULL
      `;
      console.log(`  ✓ Updated ${fallbackUpdated} records using boardId`);
    }
  }

  // Step 6: Create indexes if they don't exist
  console.log('\nStep 6: Creating indexes...');

  try {
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "BoardItemActivity_projectId_idx"
      ON "BoardItemActivity"("projectId")
    `;
    console.log('  ✓ projectId index');
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
    console.log('  ✓ projectId index (already exists)');
  }

  try {
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "BoardItemActivity_team_sync_idx"
      ON "BoardItemActivity"("workspaceId", "itemType", "action", "createdAt" DESC)
    `;
    console.log('  ✓ team_sync index');
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
    console.log('  ✓ team_sync index (already exists)');
  }

  try {
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "BoardItemActivity_item_history_idx"
      ON "BoardItemActivity"("itemId", "itemType", "action", "createdAt")
    `;
    console.log('  ✓ item_history index');
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
    console.log('  ✓ item_history index (already exists)');
  }

  // Step 7: Final verification
  console.log('\n=== Migration Summary ===');

  const totalAfter = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity"
  `;
  const withProjectId = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity" WHERE "projectId" IS NOT NULL
  `;
  const orphans = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity" WHERE "projectId" IS NULL
  `;
  const validIssueRefs = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt
    FROM "BoardItemActivity" b
    WHERE EXISTS (SELECT 1 FROM "Issue" i WHERE i.id = b."itemId")
  `;

  console.log(`  Total records: ${Number(totalAfter[0]?.cnt || 0)}`);
  console.log(`  Records with projectId: ${Number(withProjectId[0]?.cnt || 0)}`);
  console.log(`  Orphan records (no projectId): ${Number(orphans[0]?.cnt || 0)}`);
  console.log(`  Records with valid Issue reference: ${Number(validIssueRefs[0]?.cnt || 0)}`);

  const orphanCount = Number(orphans[0]?.cnt || 0);
  if (orphanCount > 0) {
    console.log(`\n⚠️  ${orphanCount} records have no projectId (may be from deleted issues)`);
    console.log('   These records will still work but won\'t be filterable by project.');
  } else {
    console.log('\n✅ All records have projectId!');
  }

  console.log('\n✅ Migration completed successfully!');
  console.log('\nNote: The Prisma model IssueActivity uses @@map("BoardItemActivity")');
  console.log('so no table rename is needed. The old boardId/taskId columns are preserved');
  console.log('for backward compatibility but are no longer used.');
}

main()
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

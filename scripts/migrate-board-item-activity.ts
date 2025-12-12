/**
 * Migration Script: BoardItemActivity → IssueActivity
 *
 * This script migrates historical activity data from the old BoardItemActivity table
 * to the new IssueActivity table used by the unified Issue model.
 *
 * Run with: npx ts-node scripts/migrate-board-item-activity.ts
 * Or: npx tsx scripts/migrate-board-item-activity.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BoardItemActivityRow {
  id: string;
  action: string;
  details: string | null;
  itemType: string;
  itemId: string;
  userId: string;
  workspaceId: string;
  boardId: string | null;
  createdAt: Date;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  taskId: string | null;
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
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

async function getOldActivityCount(): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "BoardItemActivity";
    `;
    return Number(result[0]?.count ?? 0);
  } catch (error) {
    console.log('BoardItemActivity table may not exist or is empty');
    return 0;
  }
}

async function getNewActivityCount(): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "IssueActivity";
    `;
    return Number(result[0]?.count ?? 0);
  } catch (error) {
    console.error('Error counting IssueActivity:', error);
    return 0;
  }
}

async function migrateActivities(): Promise<{ migrated: number; skipped: number; errors: number }> {
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  // Fetch old activities in batches
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const oldActivities = await prisma.$queryRaw<BoardItemActivityRow[]>`
        SELECT
          "id", "action", "details", "itemType", "itemId",
          "userId", "workspaceId", "boardId", "createdAt",
          "fieldName", "oldValue", "newValue", "taskId"
        FROM "BoardItemActivity"
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize} OFFSET ${offset}
      `;

      if (oldActivities.length === 0) {
        hasMore = false;
        break;
      }

      for (const activity of oldActivities) {
        try {
          // Check if already migrated
          const existing = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "IssueActivity" WHERE "id" = ${activity.id}
          `;

          if (existing.length > 0) {
            skipped++;
            continue;
          }

          // Determine the correct itemId (prefer taskId if available)
          const itemId = activity.taskId || activity.itemId;

          // Check if the referenced issue still exists
          const issueExists = await prisma.issue.findUnique({
            where: { id: itemId },
            select: { id: true, projectId: true }
          });

          // Use the issue's projectId if available, otherwise fall back to boardId
          const projectId = issueExists?.projectId || activity.boardId;

          // Build details with originalItemType if different
          let details = activity.details;
          if (activity.itemType && activity.itemType !== 'ISSUE') {
            try {
              const detailsObj = activity.details ? JSON.parse(activity.details) : {};
              detailsObj.originalItemType = activity.itemType;
              details = JSON.stringify(detailsObj);
            } catch {
              // If details isn't valid JSON, create new object
              details = JSON.stringify({
                originalItemType: activity.itemType,
                originalDetails: activity.details
              });
            }
          }

          // Insert into IssueActivity
          await prisma.$executeRaw`
            INSERT INTO "IssueActivity" (
              "id", "action", "details", "itemType", "itemId",
              "userId", "workspaceId", "projectId", "createdAt",
              "fieldName", "oldValue", "newValue"
            ) VALUES (
              ${activity.id},
              ${activity.action},
              ${details},
              'ISSUE',
              ${itemId},
              ${activity.userId},
              ${activity.workspaceId},
              ${projectId},
              ${activity.createdAt},
              ${activity.fieldName},
              ${activity.oldValue},
              ${activity.newValue}
            )
          `;

          migrated++;

          if (migrated % 100 === 0) {
            console.log(`Progress: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
          }
        } catch (error) {
          errors++;
          console.error(`Error migrating activity ${activity.id}:`, error);
        }
      }

      offset += batchSize;
    } catch (error) {
      console.error('Error fetching batch:', error);
      hasMore = false;
    }
  }

  return { migrated, skipped, errors };
}

async function main() {
  console.log('=== BoardItemActivity → IssueActivity Migration ===\n');

  // Check if BoardItemActivity table exists
  const tableExists = await checkTableExists('BoardItemActivity');
  if (!tableExists) {
    console.log('BoardItemActivity table does not exist. Nothing to migrate.');
    return;
  }

  // Get counts before migration
  const oldCount = await getOldActivityCount();
  const newCountBefore = await getNewActivityCount();

  console.log(`BoardItemActivity records: ${oldCount}`);
  console.log(`IssueActivity records (before): ${newCountBefore}\n`);

  if (oldCount === 0) {
    console.log('No records to migrate.');
    return;
  }

  console.log('Starting migration...\n');

  const result = await migrateActivities();

  const newCountAfter = await getNewActivityCount();

  console.log('\n=== Migration Complete ===');
  console.log(`Migrated: ${result.migrated}`);
  console.log(`Skipped (already existed): ${result.skipped}`);
  console.log(`Errors: ${result.errors}`);
  console.log(`\nIssueActivity records (after): ${newCountAfter}`);
  console.log(`Net new records: ${newCountAfter - newCountBefore}`);

  if (result.errors > 0) {
    console.log('\n⚠️  Some records failed to migrate. Please review the errors above.');
  } else if (result.migrated > 0) {
    console.log('\n✅ Migration completed successfully!');
    console.log('\nNote: The BoardItemActivity table has NOT been dropped.');
    console.log('After verifying the migration, you can drop it manually:');
    console.log('  DROP TABLE "BoardItemActivity";');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

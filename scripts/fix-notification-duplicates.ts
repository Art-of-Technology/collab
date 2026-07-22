import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Fixing Duplicate NotificationPreferences (userId + workspaceId) ===\n');

  // Find all duplicate (userId, workspaceId) combinations
  const duplicates = await prisma.$queryRaw<Array<{userId: string, workspaceId: string | null, count: bigint}>>`
    SELECT "userId", "workspaceId", COUNT(*) as count
    FROM "NotificationPreferences"
    GROUP BY "userId", "workspaceId"
    HAVING COUNT(*) > 1
  `;

  console.log(`Found ${duplicates.length} duplicate (userId, workspaceId) combinations\n`);

  let totalDeleted = 0;

  for (const dup of duplicates) {
    const { userId, workspaceId } = dup;
    const count = Number(dup.count);

    // Get all records for this user+workspace combination, ordered by updatedAt descending (keep newest)
    let records: Array<{id: string, updatedAt: Date}>;

    if (workspaceId === null) {
      records = await prisma.$queryRaw<Array<{id: string, updatedAt: Date}>>`
        SELECT "id", "updatedAt"
        FROM "NotificationPreferences"
        WHERE "userId" = ${userId} AND "workspaceId" IS NULL
        ORDER BY "updatedAt" DESC
      `;
    } else {
      records = await prisma.$queryRaw<Array<{id: string, updatedAt: Date}>>`
        SELECT "id", "updatedAt"
        FROM "NotificationPreferences"
        WHERE "userId" = ${userId} AND "workspaceId" = ${workspaceId}
        ORDER BY "updatedAt" DESC
      `;
    }

    // Keep the first one (newest), delete the rest
    const toDelete = records.slice(1).map(r => r.id);

    if (toDelete.length > 0) {
      await prisma.notificationPreferences.deleteMany({
        where: {
          id: { in: toDelete }
        }
      });

      console.log(`User ${userId} + Workspace ${workspaceId || 'NULL'}: Deleted ${toDelete.length} duplicate(s)`);
      totalDeleted += toDelete.length;
    }
  }

  console.log(`\n=== Cleanup Complete ===`);
  console.log(`Total deleted: ${totalDeleted}`);

  // Verify
  const remaining = await prisma.$queryRaw<Array<{cnt: bigint}>>`SELECT COUNT(*) as cnt FROM "NotificationPreferences"`;
  console.log(`Remaining records: ${Number(remaining[0]?.cnt || 0)}`);

  // Check for any remaining duplicates
  const remainingDups = await prisma.$queryRaw<Array<{count: bigint}>>`
    SELECT COUNT(*) as count
    FROM (
      SELECT "userId", "workspaceId", COUNT(*) as cnt
      FROM "NotificationPreferences"
      GROUP BY "userId", "workspaceId"
      HAVING COUNT(*) > 1
    ) as dups
  `;
  console.log(`Remaining duplicate combinations: ${Number(remainingDups[0]?.count || 0)}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== BoardItemActivity Analysis ===\n');

  // Total count
  const total = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity"
  `;
  console.log('Total records:', Number(total[0]?.cnt || 0));

  // Count by itemType
  const byItemType = await prisma.$queryRaw<Array<{itemType: string, cnt: bigint}>>`
    SELECT "itemType", COUNT(*) as cnt
    FROM "BoardItemActivity"
    GROUP BY "itemType"
    ORDER BY cnt DESC
  `;
  console.log('\nBy itemType:');
  byItemType.forEach(r => console.log(`  ${r.itemType}: ${Number(r.cnt)}`));

  // Count by action
  const byAction = await prisma.$queryRaw<Array<{action: string, cnt: bigint}>>`
    SELECT "action", COUNT(*) as cnt
    FROM "BoardItemActivity"
    GROUP BY "action"
    ORDER BY cnt DESC
    LIMIT 20
  `;
  console.log('\nBy action (top 20):');
  byAction.forEach(r => console.log(`  ${r.action}: ${Number(r.cnt)}`));

  // Check boardId usage
  const withBoardId = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity" WHERE "boardId" IS NOT NULL
  `;
  console.log('\nRecords with boardId:', Number(withBoardId[0]?.cnt || 0));

  // Check taskId usage
  const withTaskId = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity" WHERE "taskId" IS NOT NULL
  `;
  console.log('Records with taskId:', Number(withTaskId[0]?.cnt || 0));

  // Check if itemId references valid Issues
  const validItemIds = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt
    FROM "BoardItemActivity" b
    WHERE EXISTS (SELECT 1 FROM "Issue" i WHERE i.id = b."itemId")
  `;
  console.log('\nRecords with valid Issue itemId:', Number(validItemIds[0]?.cnt || 0));

  // Check if we can derive projectId from Issue
  const withProjectFromIssue = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt
    FROM "BoardItemActivity" b
    JOIN "Issue" i ON i.id = b."itemId"
    WHERE i."projectId" IS NOT NULL
  `;
  console.log('Records where projectId can be derived from Issue:', Number(withProjectFromIssue[0]?.cnt || 0));

  // Sample records with different itemTypes
  console.log('\n=== Sample Records ===');

  const samples = await prisma.$queryRaw<Array<any>>`
    SELECT DISTINCT ON ("itemType") *
    FROM "BoardItemActivity"
    ORDER BY "itemType", "createdAt" DESC
    LIMIT 5
  `;
  samples.forEach(s => {
    console.log(`\n${s.itemType}:`);
    console.log(`  id: ${s.id}`);
    console.log(`  action: ${s.action}`);
    console.log(`  itemId: ${s.itemId}`);
    console.log(`  boardId: ${s.boardId}`);
    console.log(`  taskId: ${s.taskId}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

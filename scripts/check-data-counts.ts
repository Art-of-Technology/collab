import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Data Counts ===\n');

  const issueCount = await prisma.issue.count();
  console.log('Issue count:', issueCount);

  const taskCount = await prisma.$queryRaw<Array<{cnt: bigint}>>`SELECT COUNT(*) as cnt FROM "Task"`;
  console.log('Task count:', Number(taskCount[0]?.cnt || 0));

  const projectCount = await prisma.project.count();
  console.log('Project count:', projectCount);

  const boardItemActivityCount = await prisma.$queryRaw<Array<{cnt: bigint}>>`SELECT COUNT(*) as cnt FROM "BoardItemActivity"`;
  console.log('BoardItemActivity count:', Number(boardItemActivityCount[0]?.cnt || 0));

  // Check database name
  const dbName = await prisma.$queryRaw<Array<{current_database: string}>>`SELECT current_database()`;
  console.log('\nDatabase:', dbName[0]?.current_database);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

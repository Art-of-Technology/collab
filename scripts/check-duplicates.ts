import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for duplicates...');

  // Check for duplicate userId in NotificationPreferences
  const duplicates = await prisma.$queryRaw<Array<{userId: string, count: bigint}>>`
    SELECT "userId", COUNT(*) as count
    FROM "NotificationPreferences"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  `;

  console.log('Duplicate userIds in NotificationPreferences:', duplicates.length);
  if (duplicates.length > 0) {
    console.log('Duplicates:', JSON.stringify(duplicates.map(d => ({userId: d.userId, count: Number(d.count)})), null, 2));
  }

  const total = await prisma.$queryRaw<Array<{cnt: bigint}>>`SELECT COUNT(*) as cnt FROM "NotificationPreferences"`;
  console.log('Total NotificationPreferences records:', Number(total[0]?.cnt || 0));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

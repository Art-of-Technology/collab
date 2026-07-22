import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Database Tables ===\n');

  // Check if IssueActivity exists
  const issueActivityExists = await prisma.$queryRaw<Array<{exists: boolean}>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'IssueActivity'
    );
  `;
  console.log('IssueActivity table exists:', issueActivityExists[0]?.exists);

  // Check if BoardItemActivity exists
  const boardItemActivityExists = await prisma.$queryRaw<Array<{exists: boolean}>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'BoardItemActivity'
    );
  `;
  console.log('BoardItemActivity table exists:', boardItemActivityExists[0]?.exists);

  // Count records if BoardItemActivity exists
  if (boardItemActivityExists[0]?.exists) {
    const count = await prisma.$queryRaw<Array<{cnt: bigint}>>`
      SELECT COUNT(*) as cnt FROM "BoardItemActivity"
    `;
    console.log('BoardItemActivity records:', Number(count[0]?.cnt || 0));
  }

  // List all tables
  const tables = await prisma.$queryRaw<Array<{tablename: string}>>`
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log('\nAll tables in database:');
  tables.forEach(t => console.log(' -', t.tablename));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

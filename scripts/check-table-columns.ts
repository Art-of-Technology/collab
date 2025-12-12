import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== BoardItemActivity Table Columns ===\n');

  const columns = await prisma.$queryRaw<Array<{column_name: string, data_type: string, is_nullable: string}>>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'BoardItemActivity'
    ORDER BY ordinal_position
  `;

  columns.forEach(c => {
    console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`);
  });

  // Count records again
  const count = await prisma.$queryRaw<Array<{cnt: bigint}>>`
    SELECT COUNT(*) as cnt FROM "BoardItemActivity"
  `;
  console.log('\nTotal records:', Number(count[0]?.cnt || 0));

  // Sample record
  const sample = await prisma.$queryRaw<Array<any>>`
    SELECT * FROM "BoardItemActivity" LIMIT 1
  `;
  console.log('\nSample record:', JSON.stringify(sample[0], null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

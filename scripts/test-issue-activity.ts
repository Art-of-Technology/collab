import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Testing IssueActivity Model ===\n');

  // Test count
  const count = await prisma.issueActivity.count();
  console.log('IssueActivity count:', count);

  // Get a valid user and workspace
  const user = await prisma.user.findFirst();
  const workspace = await prisma.workspace.findFirst();

  if (!user || !workspace) {
    console.log('No user or workspace found for testing');
    return;
  }

  // Create a test record
  const test = await prisma.issueActivity.create({
    data: {
      action: 'TEST',
      itemType: 'ISSUE',
      itemId: 'test-id',
      userId: user.id,
      workspaceId: workspace.id,
    }
  });
  console.log('Created test record:', test.id);

  // Delete the test
  await prisma.issueActivity.delete({ where: { id: test.id } });
  console.log('Deleted test record');

  console.log('\n✅ IssueActivity model is working correctly!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

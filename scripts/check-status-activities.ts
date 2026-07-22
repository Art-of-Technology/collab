import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const a = await p.issueActivity.findMany({
    where: { action: 'STATUS_CHANGED', newStatusId: null },
    take: 10,
    select: { id: true, oldValue: true, newValue: true, projectId: true, itemId: true }
  });
  console.log('Sample unmatched STATUS_CHANGED activities:');
  console.log(JSON.stringify(a, null, 2));

  // Also check what statuses exist for those projects
  const projectIds = [...new Set(a.map(x => x.projectId).filter(Boolean))] as string[];
  if (projectIds.length > 0) {
    const statuses = await p.projectStatus.findMany({
      where: { projectId: { in: projectIds } },
      select: { name: true, projectId: true },
    });
    console.log('\nAvailable statuses for these projects:');
    console.log(JSON.stringify(statuses, null, 2));
  }
}

main().catch(console.error).finally(() => p.$disconnect());

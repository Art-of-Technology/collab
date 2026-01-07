import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkIssueStatus(issueKeys: string[]) {
  console.log('\n=== Checking Issue Statuses ===\n');

  for (const key of issueKeys) {
    console.log(`\n--- Issue: ${key} ---`);

    const issue = await prisma.issue.findFirst({
      where: {
        issueKey: key,
      },
      select: {
        id: true,
        issueKey: true,
        title: true,
        status: true,           // Legacy status field
        statusId: true,         // New status system
        statusValue: true,      // Backward compatibility field
        projectId: true,
        assigneeId: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            isArchived: true,
          }
        },
        projectStatus: {
          select: {
            id: true,
            name: true,
            displayName: true,
            isFinal: true,
            isActive: true,
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    if (!issue) {
      console.log(`  NOT FOUND`);
      continue;
    }

    console.log(`  ID: ${issue.id}`);
    console.log(`  Title: ${issue.title}`);
    console.log(`  Project: ${issue.project?.name || 'NULL'} (archived: ${issue.project?.isArchived})`);
    console.log(`  Assignee: ${issue.assignee?.name || 'NULL'}`);
    console.log(`  `);
    console.log(`  STATUS FIELDS:`);
    console.log(`    status (legacy): "${issue.status || 'NULL'}"`);
    console.log(`    statusId: "${issue.statusId || 'NULL'}"`);
    console.log(`    statusValue: "${issue.statusValue || 'NULL'}"`);
    console.log(`  `);
    console.log(`  PROJECT STATUS (linked):`);
    if (issue.projectStatus) {
      console.log(`    id: ${issue.projectStatus.id}`);
      console.log(`    name: "${issue.projectStatus.name}"`);
      console.log(`    displayName: "${issue.projectStatus.displayName}"`);
      console.log(`    isFinal: ${issue.projectStatus.isFinal}`);
      console.log(`    isActive: ${issue.projectStatus.isActive}`);
    } else {
      console.log(`    NULL (no linked projectStatus)`);
    }

    // Check status changes for this issue
    const statusChanges = await prisma.issueActivity.findMany({
      where: {
        itemId: issue.id,
        action: 'STATUS_CHANGED',
      },
      select: {
        id: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log(`  `);
    console.log(`  RECENT STATUS CHANGES (last 5):`);
    if (statusChanges.length === 0) {
      console.log(`    No status changes recorded`);
    } else {
      for (const change of statusChanges) {
        console.log(`    ${change.createdAt.toISOString()}: "${change.oldValue}" → "${change.newValue}"`);
      }
    }

    // Classification analysis
    console.log(`  `);
    console.log(`  CLASSIFICATION ANALYSIS:`);
    const statusToCheck = issue.projectStatus?.name || issue.projectStatus?.displayName || issue.status || '';
    const s = statusToCheck.toLowerCase().replace(/[\u2018\u2019\u201B\u0060]/g, "'");

    console.log(`    Status string to classify: "${statusToCheck}" → normalized: "${s}"`);

    const isCompleted =
      issue.projectStatus?.isFinal ||
      s.includes('done') ||
      s.includes('complete') ||
      s.includes('closed') ||
      s.includes('resolved') ||
      s.includes('cancel') ||
      s.includes('deprecate') ||
      s.includes('wont') ||
      s.includes("won't") ||
      s.includes('duplicate') ||
      s.includes('invalid') ||
      s.includes('archived');

    const isInReview = s.includes('review') || s.includes('test') || s.includes('qa') || s.includes('deploy') || s.includes('staging');
    const isInProgress = s.includes('progress') || s.includes('working') || s.includes('doing') || s.includes('development') || s.includes('active');
    const isBlocked = s.includes('blocked') || s.includes('waiting') || s.includes('on hold') || s.includes('pending');
    const isBacklog = s.includes('backlog') || s.includes('icebox') || s.includes('later');

    console.log(`    isFinal flag: ${issue.projectStatus?.isFinal || false}`);
    console.log(`    Would be classified as:`);
    console.log(`      - completed: ${isCompleted}`);
    console.log(`      - in_review: ${isInReview}`);
    console.log(`      - in_progress: ${isInProgress}`);
    console.log(`      - blocked: ${isBlocked}`);
    console.log(`      - backlog: ${isBacklog}`);
    console.log(`      - planned: ${!isCompleted && !isInReview && !isInProgress && !isBlocked && !isBacklog}`);
  }

  // Also check all project statuses with isFinal = true
  console.log('\n\n=== All Final Statuses in Database ===\n');
  const finalStatuses = await prisma.projectStatus.findMany({
    where: { isFinal: true },
    select: {
      name: true,
      displayName: true,
      project: { select: { name: true } },
    },
  });

  if (finalStatuses.length === 0) {
    console.log('No statuses with isFinal=true found!');
  } else {
    for (const status of finalStatuses) {
      console.log(`  "${status.displayName}" (${status.name}) - Project: ${status.project.name}`);
    }
  }
}

// Run the check
const issueKeys = ['RND-T6', 'PYD-4', 'PYB-T49'];
checkIssueStatus(issueKeys)
  .then(() => {
    console.log('\n=== Done ===\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

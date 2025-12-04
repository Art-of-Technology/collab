/**
 * Script to analyze issue activities and understand data structure
 * Run with: npx tsx scripts/analyze-issue-activities.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeIssueActivities() {
  console.log('🔍 Analyzing Issue Activities...\n');

  // Fetch sample issues
  const issues = await prisma.issue.findMany({
    take: 10,
    include: {
      assignee: {
        select: { id: true, name: true, email: true }
      },
      reporter: {
        select: { id: true, name: true, email: true }
      },
      project: {
        select: { id: true, name: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  console.log(`Found ${issues.length} issues to analyze\n`);

  for (const issue of issues) {
    // Fetch activities for this issue
    const activities = await prisma.boardItemActivity.findMany({
      where: {
        itemId: issue.id,
        itemType: 'ISSUE'
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📋 Issue: ${issue.issueKey || issue.id} - ${issue.title}`);
    console.log(`   Status: ${issue.status || issue.statusValue || 'Unknown'}`);
    console.log(`   Assignee: ${issue.assignee?.name || 'Unassigned'} (${issue.assignee?.email || 'N/A'})`);
    console.log(`   Reporter: ${issue.reporter?.name || 'Unknown'}`);
    console.log(`   Project: ${issue.project?.name || 'No project'}`);
    console.log(`   Created: ${issue.createdAt}`);
    console.log(`   Updated: ${issue.updatedAt}`);
    console.log(`   First Started: ${issue.firstStartedAt || 'Never'}`);
    console.log(`   Last Progress: ${issue.lastProgressAt || 'Never'}`);
    console.log(`   Days in Progress: ${issue.daysInProgress}`);
    console.log('');

    if (activities.length > 0) {
      console.log(`   📊 Activities (${activities.length}):`);
      for (const activity of activities) {
        const actor = activity.user?.name || 'System';
        const actorEmail = activity.user?.email || '';
        const isAssignee = activity.userId === issue.assigneeId;
        const assigneeFlag = isAssignee ? '👤 [ASSIGNEE]' : '👥 [OTHER]';
        
        console.log(`      ${assigneeFlag} ${activity.action} by ${actor} (${actorEmail})`);
        console.log(`         └─ ${activity.createdAt.toISOString()}`);
        
        if (activity.fieldName) {
          console.log(`         └─ Field: ${activity.fieldName}`);
          console.log(`         └─ Change: ${activity.oldValue || '?'} → ${activity.newValue || '?'}`);
        }
        if (activity.details) {
          console.log(`         └─ Details: ${activity.details}`);
        }
      }
      console.log('');
    } else {
      console.log('   ⚠️  No activities recorded\n');
    }
  }

  // Analyze activity patterns
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📈 Activity Pattern Analysis\n');

  const activityStats = await prisma.boardItemActivity.groupBy({
    by: ['action'],
    _count: {
      action: true
    },
    orderBy: {
      _count: {
        action: 'desc'
      }
    }
  });

  console.log('Activity Types:');
  for (const stat of activityStats) {
    console.log(`   ${stat.action}: ${stat._count.action} occurrences`);
  }

  // Analyze assignee vs actor patterns
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('👥 Assignee vs Actor Analysis\n');

  const statusChanges = await prisma.boardItemActivity.findMany({
    where: {
      action: 'STATUS_CHANGED',
      itemType: 'ISSUE'
    },
    take: 50,
    include: {
      user: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  let assigneeChanges = 0;
  let nonAssigneeChanges = 0;

  for (const activity of statusChanges) {
    // Fetch the issue to check assignee
    const issue = await prisma.issue.findUnique({
      where: { id: activity.itemId },
      select: {
        issueKey: true,
        title: true,
        assigneeId: true,
        assignee: {
          select: { name: true, email: true }
        }
      }
    });

    if (activity.userId === issue?.assigneeId) {
      assigneeChanges++;
    } else {
      nonAssigneeChanges++;
      console.log(`   ⚠️  ${issue?.issueKey || 'Unknown'}: ${activity.user?.name} changed status (assigned to ${issue?.assignee?.name || 'Unassigned'})`);
    }
  }

  console.log(`\nStatus changes by assignee: ${assigneeChanges}`);
  console.log(`Status changes by others: ${nonAssigneeChanges}`);
  console.log(`Ratio: ${((nonAssigneeChanges / statusChanges.length) * 100).toFixed(1)}% of changes made by non-assignees\n`);

  // Check field data structure
  console.log('═══════════════════════════════════════════════════════');
  console.log('📝 Field Data Structure Samples\n');

  const activitiesWithFields = await prisma.boardItemActivity.findMany({
    where: {
      fieldName: { not: null }
    },
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  for (const activity of activitiesWithFields) {
    console.log(`   Action: ${activity.action}`);
    console.log(`   Field: ${activity.fieldName}`);
    console.log(`   Old Value: ${activity.oldValue}`);
    console.log(`   New Value: ${activity.newValue}`);
    if (activity.details) {
      console.log(`   Details: ${activity.details}`);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

analyzeIssueActivities()
  .catch((error) => {
    console.error('Error analyzing activities:', error);
    process.exit(1);
  });


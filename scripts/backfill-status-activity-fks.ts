/**
 * Backfill script: Populate oldStatusId/newStatusId on existing STATUS_CHANGED activities.
 *
 * For each STATUS_CHANGED activity, matches the oldValue/newValue (raw status name)
 * against ProjectStatus.name in the same project to set the proper FK references.
 *
 * Usage: npx tsx scripts/backfill-status-activity-fks.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill of STATUS_CHANGED activity FK relations...');

  // Fetch all STATUS_CHANGED activities that don't have FK refs yet
  const activities = await prisma.issueActivity.findMany({
    where: {
      action: 'STATUS_CHANGED',
      OR: [
        { oldStatusId: null, oldValue: { not: null } },
        { newStatusId: null, newValue: { not: null } },
      ],
    },
    select: {
      id: true,
      itemId: true,
      projectId: true,
      oldValue: true,
      newValue: true,
      oldStatusId: true,
      newStatusId: true,
    },
  });

  console.log(`Found ${activities.length} STATUS_CHANGED activities to backfill.`);

  if (activities.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // Collect all project IDs we need statuses for
  const issueIds = [...new Set(activities.map(a => a.itemId))];

  // Get project mapping for issues (activity.projectId might be null for older records)
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true, projectId: true },
  });
  const issueProjectMap = new Map(issues.map(i => [i.id, i.projectId]));

  // Get all project statuses
  const projectIds = [...new Set([
    ...activities.map(a => a.projectId).filter(Boolean),
    ...issues.map(i => i.projectId),
  ])] as string[];

  const statuses = await prisma.projectStatus.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, name: true, projectId: true },
  });

  // Build lookup: projectId -> statusName -> statusId
  const statusLookup = new Map<string, Map<string, string>>();
  for (const status of statuses) {
    if (!statusLookup.has(status.projectId)) {
      statusLookup.set(status.projectId, new Map());
    }
    statusLookup.get(status.projectId)!.set(status.name, status.id);
  }

  let updated = 0;
  let skipped = 0;
  let updates: any[] = [];

  for (const activity of activities) {
    const projectId = activity.projectId || issueProjectMap.get(activity.itemId);
    if (!projectId) {
      skipped++;
      continue;
    }

    const projectStatuses = statusLookup.get(projectId);
    if (!projectStatuses) {
      skipped++;
      continue;
    }

    // Parse JSON-stringified values (e.g. '"review"' -> 'review')
    const parseValue = (v: string | null): string | null => {
      if (!v || v === 'null') return null;
      try {
        const parsed = JSON.parse(v);
        return typeof parsed === 'string' ? parsed : null;
      } catch {
        return v; // Already a plain string
      }
    };

    const oldName = parseValue(activity.oldValue);
    const newName = parseValue(activity.newValue);
    const oldStatusId = oldName ? projectStatuses.get(oldName) || null : null;
    const newStatusId = newName ? projectStatuses.get(newName) || null : null;

    // Only update if we found at least one match and it's different from current
    if (
      (oldStatusId && oldStatusId !== activity.oldStatusId) ||
      (newStatusId && newStatusId !== activity.newStatusId)
    ) {
      updates.push(prisma.issueActivity.update({
        where: { id: activity.id },
        data: {
          ...(oldStatusId ? { oldStatusId } : {}),
          ...(newStatusId ? { newStatusId } : {}),
        },
      }));
      updated++;
    } else {
      skipped++;
    }

    // Execute in batches of 100
    if (updates.length >= 100) {
      await prisma.$transaction(updates);
      updates = [];
      process.stdout.write(`\r  Processed ${updated + skipped} / ${activities.length}...`);
    }
  }

  // Final batch
  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  console.log(`\nBackfill complete: ${updated} updated, ${skipped} skipped.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

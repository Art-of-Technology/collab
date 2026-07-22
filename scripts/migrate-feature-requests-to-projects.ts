/**
 * Migration Script: Assign Feature Requests to Default Projects
 *
 * This script migrates existing feature requests to their workspace's default project.
 * Feature requests that already have a projectId or don't have a workspaceId are skipped.
 *
 * Run with: npx ts-node scripts/migrate-feature-requests-to-projects.ts
 * Or: npx tsx scripts/migrate-feature-requests-to-projects.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: number;
  noDefaultProject: number;
}

async function getFeatureRequestStats(): Promise<{
  total: number;
  withProject: number;
  withoutProject: number;
  withoutWorkspace: number;
}> {
  const total = await prisma.featureRequest.count();
  const withProject = await prisma.featureRequest.count({
    where: { projectId: { not: null } }
  });
  const withoutProject = await prisma.featureRequest.count({
    where: { projectId: null }
  });
  const withoutWorkspace = await prisma.featureRequest.count({
    where: { workspaceId: null }
  });

  return { total, withProject, withoutProject, withoutWorkspace };
}

async function migrateFeatureRequests(): Promise<MigrationResult> {
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  let noDefaultProject = 0;

  // Get all feature requests that have a workspace but no project
  const featureRequests = await prisma.featureRequest.findMany({
    where: {
      workspaceId: { not: null },
      projectId: null
    },
    select: {
      id: true,
      title: true,
      workspaceId: true
    }
  });

  console.log(`Found ${featureRequests.length} feature requests to migrate`);

  // Group by workspace for efficient default project lookups
  const workspaceIds = [...new Set(featureRequests.map(fr => fr.workspaceId!))];
  console.log(`Feature requests span ${workspaceIds.length} workspace(s)`);

  // Get default projects for each workspace
  const defaultProjects = await prisma.project.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      isDefault: true
    },
    select: {
      id: true,
      workspaceId: true,
      name: true
    }
  });

  // Create a map of workspaceId -> default projectId
  const workspaceToDefaultProject = new Map<string, string>();
  for (const project of defaultProjects) {
    workspaceToDefaultProject.set(project.workspaceId, project.id);
    console.log(`  Workspace ${project.workspaceId}: default project "${project.name}" (${project.id})`);
  }

  // For workspaces without a default project, get the first project
  for (const workspaceId of workspaceIds) {
    if (!workspaceToDefaultProject.has(workspaceId)) {
      const firstProject = await prisma.project.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true }
      });

      if (firstProject) {
        workspaceToDefaultProject.set(workspaceId, firstProject.id);
        console.log(`  Workspace ${workspaceId}: using first project "${firstProject.name}" (${firstProject.id})`);
      } else {
        console.log(`  Workspace ${workspaceId}: NO PROJECTS FOUND`);
      }
    }
  }

  // Migrate each feature request
  for (const fr of featureRequests) {
    try {
      const defaultProjectId = workspaceToDefaultProject.get(fr.workspaceId!);

      if (!defaultProjectId) {
        console.log(`  Skipping "${fr.title}" (${fr.id}): No project in workspace`);
        noDefaultProject++;
        continue;
      }

      await prisma.featureRequest.update({
        where: { id: fr.id },
        data: { projectId: defaultProjectId }
      });

      migrated++;

      if (migrated % 10 === 0) {
        console.log(`  Progress: ${migrated} migrated...`);
      }
    } catch (error) {
      errors++;
      console.error(`  Error migrating "${fr.title}" (${fr.id}):`, error);
    }
  }

  return { migrated, skipped, errors, noDefaultProject };
}

async function main() {
  console.log('=== Feature Request → Project Migration ===\n');

  // Get stats before migration
  const statsBefore = await getFeatureRequestStats();
  console.log('Stats before migration:');
  console.log(`  Total feature requests: ${statsBefore.total}`);
  console.log(`  With projectId: ${statsBefore.withProject}`);
  console.log(`  Without projectId: ${statsBefore.withoutProject}`);
  console.log(`  Without workspaceId: ${statsBefore.withoutWorkspace}\n`);

  if (statsBefore.withoutProject === 0) {
    console.log('All feature requests already have a project assigned. Nothing to migrate.');
    return;
  }

  console.log('Starting migration...\n');

  const result = await migrateFeatureRequests();

  // Get stats after migration
  const statsAfter = await getFeatureRequestStats();

  console.log('\n=== Migration Complete ===');
  console.log(`Migrated: ${result.migrated}`);
  console.log(`Skipped (no project in workspace): ${result.noDefaultProject}`);
  console.log(`Errors: ${result.errors}`);
  console.log(`\nStats after migration:`);
  console.log(`  With projectId: ${statsAfter.withProject}`);
  console.log(`  Without projectId: ${statsAfter.withoutProject}`);

  if (result.errors > 0) {
    console.log('\n⚠️  Some records failed to migrate. Please review the errors above.');
  } else if (result.migrated > 0) {
    console.log('\n✅ Migration completed successfully!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


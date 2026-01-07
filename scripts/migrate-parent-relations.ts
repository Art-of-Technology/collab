/**
 * Migration Script: Convert parentId relationships to IssueRelation entries
 *
 * This script finds all issues that have a parentId set and creates corresponding
 * IssueRelation entries with relationType: 'PARENT'.
 *
 * Usage:
 *   npx ts-node scripts/migrate-parent-relations.ts
 *
 * Or with tsx:
 *   npx tsx scripts/migrate-parent-relations.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateParentRelations() {
  console.log('Starting migration of parentId relationships to IssueRelation entries...\n');

  try {
    // Find all issues that have a parentId set
    const issuesWithParent = await prisma.issue.findMany({
      where: {
        parentId: { not: null }
      },
      select: {
        id: true,
        issueKey: true,
        parentId: true,
        workspaceId: true,
        parent: {
          select: {
            id: true,
            issueKey: true
          }
        }
      }
    });

    console.log(`Found ${issuesWithParent.length} issues with parentId set.\n`);

    if (issuesWithParent.length === 0) {
      console.log('No issues to migrate.');
      return;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const issue of issuesWithParent) {
      try {
        // Check if IssueRelation already exists
        const existingRelation = await prisma.issueRelation.findFirst({
          where: {
            sourceIssueId: issue.id,
            targetIssueId: issue.parentId!,
            relationType: 'PARENT'
          }
        });

        if (existingRelation) {
          console.log(`  [SKIP] ${issue.issueKey} -> ${issue.parent?.issueKey}: Relation already exists`);
          skipped++;
          continue;
        }

        // Create the IssueRelation entry
        await prisma.issueRelation.create({
          data: {
            sourceIssueId: issue.id,
            targetIssueId: issue.parentId!,
            relationType: 'PARENT'
            // createdBy is optional, leaving it null for migration entries
          }
        });

        console.log(`  [CREATE] ${issue.issueKey} -> ${issue.parent?.issueKey}: Created PARENT relation`);
        created++;

      } catch (error: any) {
        console.error(`  [ERROR] ${issue.issueKey}: ${error.message}`);
        errors++;
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Created: ${created}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total processed: ${issuesWithParent.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateParentRelations()
  .then(() => {
    console.log('\nMigration completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });

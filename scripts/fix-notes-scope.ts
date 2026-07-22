/**
 * Fix Notes Scope Script
 *
 * This script converts PERSONAL notes to WORKSPACE scope for a specific workspace,
 * restoring team visibility that was lost during migration.
 *
 * Run with: npx tsx scripts/fix-notes-scope.ts
 *
 * Options:
 *   --dry-run     Preview changes without applying them
 *   --workspace   Specify workspace ID (will prompt if not provided)
 */

import { PrismaClient, NoteScope } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const workspaceArgIndex = args.indexOf('--workspace');
const workspaceArg = workspaceArgIndex !== -1 ? args[workspaceArgIndex + 1] : null;

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('  Fix Notes Scope - Restore Team Visibility');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n[DRY RUN MODE] No changes will be applied.\n');
  }

  // List workspaces with PERSONAL notes
  const workspacesWithPersonalNotes = await prisma.workspace.findMany({
    where: {
      notes: {
        some: {
          scope: NoteScope.PERSONAL
        }
      }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: {
        select: {
          notes: {
            where: { scope: NoteScope.PERSONAL }
          }
        }
      }
    }
  });

  if (workspacesWithPersonalNotes.length === 0) {
    console.log('\nNo workspaces found with PERSONAL notes.');
    return;
  }

  console.log('\nWorkspaces with PERSONAL notes:');
  workspacesWithPersonalNotes.forEach((ws, index) => {
    console.log(`  ${index + 1}. ${ws.name} (${ws.slug}) - ${ws._count.notes} personal notes`);
  });

  // Select workspace
  let selectedWorkspace: typeof workspacesWithPersonalNotes[0] | undefined;

  if (workspaceArg) {
    selectedWorkspace = workspacesWithPersonalNotes.find(
      ws => ws.id === workspaceArg || ws.slug === workspaceArg
    );
    if (!selectedWorkspace) {
      console.log(`\nWorkspace "${workspaceArg}" not found or has no PERSONAL notes.`);
      return;
    }
  } else {
    const selection = await prompt('\nEnter workspace number to fix (or "all" for all workspaces): ');

    if (selection.toLowerCase() === 'all') {
      // Process all workspaces
      console.log('\nProcessing all workspaces...\n');

      for (const ws of workspacesWithPersonalNotes) {
        await processWorkspace(ws.id, ws.name, ws._count.notes);
      }

      console.log('\n' + '='.repeat(60));
      console.log('  All workspaces processed!');
      console.log('='.repeat(60));
      return;
    }

    const index = parseInt(selection) - 1;
    if (isNaN(index) || index < 0 || index >= workspacesWithPersonalNotes.length) {
      console.log('Invalid selection.');
      return;
    }
    selectedWorkspace = workspacesWithPersonalNotes[index];
  }

  await processWorkspace(selectedWorkspace.id, selectedWorkspace.name, selectedWorkspace._count.notes);
}

async function processWorkspace(workspaceId: string, workspaceName: string, personalCount: number) {
  console.log(`\nProcessing workspace: ${workspaceName}`);
  console.log(`  PERSONAL notes to convert: ${personalCount}`);

  // Show current distribution
  const currentDistribution = await prisma.note.groupBy({
    by: ['scope'],
    where: { workspaceId },
    _count: true
  });

  console.log('\n  Current scope distribution:');
  for (const item of currentDistribution) {
    console.log(`    ${item.scope}: ${item._count}`);
  }

  // Get the notes that will be changed
  const notesToChange = await prisma.note.findMany({
    where: {
      workspaceId,
      scope: NoteScope.PERSONAL
    },
    select: {
      id: true,
      title: true,
      author: { select: { name: true } }
    },
    take: 10
  });

  console.log(`\n  Sample notes that will become WORKSPACE scope:`);
  for (const note of notesToChange) {
    console.log(`    - "${note.title}" by ${note.author.name}`);
  }
  if (personalCount > 10) {
    console.log(`    ... and ${personalCount - 10} more`);
  }

  if (isDryRun) {
    console.log(`\n  [DRY RUN] Would update ${personalCount} notes to WORKSPACE scope`);
    return;
  }

  const confirm = await prompt(`\n  Convert ${personalCount} PERSONAL notes to WORKSPACE? (y/N): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('  Skipped.');
    return;
  }

  // Perform the update
  const result = await prisma.note.updateMany({
    where: {
      workspaceId,
      scope: NoteScope.PERSONAL
    },
    data: {
      scope: NoteScope.WORKSPACE
    }
  });

  console.log(`\n  ✓ Updated ${result.count} notes to WORKSPACE scope`);

  // Show new distribution
  const newDistribution = await prisma.note.groupBy({
    by: ['scope'],
    where: { workspaceId },
    _count: true
  });

  console.log('\n  New scope distribution:');
  for (const item of newDistribution) {
    console.log(`    ${item.scope}: ${item._count}`);
  }
}

main()
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

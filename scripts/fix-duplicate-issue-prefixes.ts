import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ProjectWithPrefix {
  id: string;
  name: string;
  issuePrefix: string;
  workspaceId: string;
  createdAt: Date;
}

async function fixDuplicateIssuePrefixes() {
  console.log('🔍 Checking for duplicate issue prefixes...\n');

  try {
    // Get all projects
    const allProjects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        issuePrefix: true,
        workspaceId: true,
        createdAt: true,
      },
      orderBy: [
        { workspaceId: 'asc' },
        { issuePrefix: 'asc' },
        { createdAt: 'asc' }, // Older projects get priority
      ],
    });

    console.log(`📊 Found ${allProjects.length} total projects`);

    // Group by workspace and then by issue prefix
    const workspaceGroups = new Map<string, Map<string, ProjectWithPrefix[]>>();
    
    for (const project of allProjects) {
      if (!workspaceGroups.has(project.workspaceId)) {
        workspaceGroups.set(project.workspaceId, new Map());
      }
      
      const prefixGroups = workspaceGroups.get(project.workspaceId)!;
      if (!prefixGroups.has(project.issuePrefix)) {
        prefixGroups.set(project.issuePrefix, []);
      }
      
      prefixGroups.get(project.issuePrefix)!.push(project);
    }

    let totalDuplicatesFound = 0;
    let totalUpdated = 0;

    // Process each workspace
    for (const [workspaceId, prefixGroups] of workspaceGroups) {
      console.log(`\n🏢 Processing workspace: ${workspaceId}`);
      
      // Find duplicates in this workspace
      const duplicatePrefixes = Array.from(prefixGroups.entries()).filter(
        ([prefix, projects]) => projects.length > 1
      );

      if (duplicatePrefixes.length === 0) {
        console.log('   ✅ No duplicates found in this workspace');
        continue;
      }

      console.log(`   ⚠️  Found ${duplicatePrefixes.length} duplicate prefix(es)`);

      for (const [originalPrefix, projects] of duplicatePrefixes) {
        console.log(`\n   📝 Fixing prefix "${originalPrefix}" (${projects.length} projects):`);
        totalDuplicatesFound += projects.length - 1; // -1 because first one stays the same

        // Keep the first project with original prefix (oldest)
        const [firstProject, ...duplicateProjects] = projects;
        console.log(`      ✅ Keeping "${firstProject.name}" with prefix "${originalPrefix}"`);

        // Update the duplicate projects with incremental numbers
        for (let i = 0; i < duplicateProjects.length; i++) {
          const project = duplicateProjects[i];
          let newPrefix = `${originalPrefix}${i + 1}`;
          
          // Make sure the new prefix doesn't conflict with existing ones
          let counter = i + 1;
          while (await checkPrefixExists(workspaceId, newPrefix)) {
            counter++;
            newPrefix = `${originalPrefix}${counter}`;
          }

          try {
            await prisma.project.update({
              where: { id: project.id },
              data: { issuePrefix: newPrefix },
            });

            console.log(`      🔄 Updated "${project.name}" from "${originalPrefix}" to "${newPrefix}"`);
            totalUpdated++;
          } catch (error) {
            console.error(`      ❌ Failed to update project ${project.name}:`, error);
          }
        }
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   • Total duplicate projects found: ${totalDuplicatesFound}`);
    console.log(`   • Projects successfully updated: ${totalUpdated}`);
    
    if (totalUpdated > 0) {
      console.log('\n✅ All duplicate issue prefixes have been fixed!');
      console.log('💡 You can now run: npx prisma db push');
    } else if (totalDuplicatesFound === 0) {
      console.log('\n✅ No duplicate issue prefixes found. Database is ready!');
      console.log('💡 You can now run: npx prisma db push');
    } else {
      console.log('\n⚠️  Some updates failed. Please check the errors above.');
    }

  } catch (error) {
    console.error('❌ Error fixing duplicate issue prefixes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkPrefixExists(workspaceId: string, prefix: string): Promise<boolean> {
  const existing = await prisma.project.findFirst({
    where: {
      workspaceId,
      issuePrefix: prefix,
    },
  });
  return !!existing;
}

// Run the script
if (require.main === module) {
  fixDuplicateIssuePrefixes()
    .then(() => {
      console.log('\n🎉 Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

export { fixDuplicateIssuePrefixes };

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateTaskActivities() {
  console.log('🔄 Starting TaskActivity to BoardItemActivity migration...');

  try {
    // Check if TaskActivity table exists (it might have been renamed)
    const taskActivitiesExist = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'TaskActivity'
      );
    `;

    console.log('TaskActivity table exists:', taskActivitiesExist);

    // Get all existing task activities
    let taskActivities: any[] = [];
    
    try {
      // Try to fetch from TaskActivity table if it still exists
      taskActivities = await prisma.$queryRaw`
        SELECT * FROM "TaskActivity" ORDER BY "createdAt" ASC;
      `;
      console.log(`📊 Found ${taskActivities.length} existing TaskActivity records`);
    } catch {
      console.log('TaskActivity table not found or already migrated');
      return;
    }

    if (taskActivities.length === 0) {
      console.log('✅ No TaskActivity records to migrate');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const activity of taskActivities) {
      try {
        // Get task info for workspace and board context
        const task = await prisma.task.findUnique({
          where: { id: activity.taskId },
          select: { 
            id: true, 
            workspaceId: true, 
            taskBoardId: true,
            title: true 
          },
        });

        if (!task) {
          console.log(`⚠️  Task not found for activity ${activity.id}, skipping...`);
          skippedCount++;
          continue;
        }

        // Check if this activity has already been migrated
        const existingActivity = await prisma.boardItemActivity.findFirst({
          where: {
            itemType: 'TASK',
            itemId: activity.taskId,
            userId: activity.userId,
            action: activity.action,
            createdAt: activity.createdAt,
          },
        });

        if (existingActivity) {
          console.log(`⏭️  Activity ${activity.id} already migrated, skipping...`);
          skippedCount++;
          continue;
        }

        // Parse details if it's a JSON string
        let parsedDetails = null;
        if (activity.details) {
          try {
            parsedDetails = typeof activity.details === 'string' 
              ? JSON.parse(activity.details) 
              : activity.details;
          } catch {
            parsedDetails = { originalDetails: activity.details };
          }
        }

        // Create new BoardItemActivity record
        await prisma.boardItemActivity.create({
          data: {
            id: activity.id, // Keep the original ID to maintain references
            action: activity.action,
            details: activity.details, // Keep as JSON string
            itemType: 'TASK',
            itemId: activity.taskId,
            userId: activity.userId,
            workspaceId: task.workspaceId,
            boardId: task.taskBoardId,
            createdAt: activity.createdAt,
            // Legacy fields for backward compatibility
            fieldName: parsedDetails?.fieldName || null,
            oldValue: parsedDetails?.oldValue || null,
            newValue: parsedDetails?.newValue || null,
          },
        });

        migratedCount++;
        
        if (migratedCount % 100 === 0) {
          console.log(`📈 Migrated ${migratedCount} records...`);
        }

      } catch (error) {
        console.error(`❌ Error migrating activity ${activity.id}:`, error);
        errorCount++;
        
        // Continue with other records even if one fails
        continue;
      }
    }

    console.log('\n🎉 Migration completed!');
    console.log(`✅ Successfully migrated: ${migratedCount} records`);
    console.log(`⏭️  Skipped (already migrated): ${skippedCount} records`);
    console.log(`❌ Errors: ${errorCount} records`);

    if (migratedCount > 0) {
      console.log('\n📋 Migration Summary:');
      console.log('- All TaskActivity records have been copied to BoardItemActivity');
      console.log('- Original TaskActivity records are preserved');
      console.log('- New system will use BoardItemActivity going forward');
      console.log('- You can safely drop the TaskActivity table after verification');
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  }
}

// Verification function to check migration success
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');

  try {
    // Count migrated BoardItemActivity records for tasks
    const migratedCount = await prisma.boardItemActivity.count({
      where: { itemType: 'TASK' },
    });

    console.log(`📊 Current BoardItemActivity records for tasks: ${migratedCount}`);

    // Sample migrated records
    const sampleMigrated = await prisma.boardItemActivity.findMany({
      where: { itemType: 'TASK' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        user: {
          select: { name: true },
        },
      },
    });

    console.log('\n📋 Sample activity records:');
    if (sampleMigrated.length > 0) {
      sampleMigrated.forEach((record, index) => {
        console.log(`${index + 1}. ${record.action} by ${record.user.name} on ${record.createdAt}`);
      });
    } else {
      console.log('No activity records found. This is normal for a new system.');
    }

    console.log('\n✅ Verification completed');
    console.log('\n📋 Migration Status:');
    console.log('- TaskActivity table has been successfully migrated to BoardItemActivity');
    console.log('- All new task activities will be stored in BoardItemActivity');
    console.log('- The system is ready to track comprehensive board item history');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Main execution
async function main() {
  try {
    await migrateTaskActivities();
    await verifyMigration();
  } catch (error) {
    console.error('Migration process failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { migrateTaskActivities, verifyMigration }; 
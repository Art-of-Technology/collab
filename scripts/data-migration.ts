import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface MigrationStats {
  projects: number
  issues: number
  defaultViews: number
  updatedColumns: number
  updatedRelationships: number
}

async function main() {
  console.log('🚀 Starting data migration to unified Issue model...')
  
  const stats: MigrationStats = {
    projects: 0,
    issues: 0,
    defaultViews: 0,
    updatedColumns: 0,
    updatedRelationships: 0
  }

  try {
    // Step 1: Migrate TaskBoard → Project
    console.log('\n📋 Step 1: Migrating TaskBoard → Project...')
    await migrateTaskBoardToProject(stats)

    // Step 2: Update TaskColumn references
    console.log('\n🏗️  Step 2: Updating TaskColumn references...')
    await updateTaskColumnReferences(stats)

    // Step 3: Migrate Task → Issue
    console.log('\n📝 Step 3: Migrating Task → Issue...')
    await migrateTaskToIssue(stats)

    // Step 4: Migrate Epic → Issue
    console.log('\n🎯 Step 4: Migrating Epic → Issue...')
    await migrateEpicToIssue(stats)

    // Step 5: Migrate Story → Issue
    console.log('\n📖 Step 5: Migrating Story → Issue...')
    await migrateStoryToIssue(stats)

    // Step 6: Migrate Milestone → Issue
    console.log('\n🏁 Step 6: Migrating Milestone → Issue...')
    await migrateMilestoneToIssue(stats)

    // Step 7: Update Issue parent relationships
    console.log('\n🔗 Step 7: Updating Issue parent relationships...')
    await updateIssueParentRelationships(stats)

    // Step 8: Generate new issue keys
    console.log('\n🔑 Step 8: Generating new issue keys...')
    await generateNewIssueKeys(stats)

    // Step 9: Create default views
    console.log('\n👁️  Step 9: Creating default views...')
    await createDefaultViews(stats)

    // Step 10: Verification
    console.log('\n✅ Step 10: Verifying migration...')
    await verifyMigration()

    console.log('\n🎉 Migration completed successfully!')
    console.log('\nMigration Statistics:')
    console.log(`  Projects created: ${stats.projects}`)
    console.log(`  Issues created: ${stats.issues}`)
    console.log(`  Default views created: ${stats.defaultViews}`)
    console.log(`  Columns updated: ${stats.updatedColumns}`)
    console.log(`  Relationships updated: ${stats.updatedRelationships}`)

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

async function migrateTaskBoardToProject(stats: MigrationStats) {
  // Get all TaskBoards
  const taskBoards = await prisma.taskBoard.findMany()
  
  for (const taskBoard of taskBoards) {
    // Check if Project already exists
    const existingProject = await prisma.project.findUnique({
      where: { id: taskBoard.id }
    })

    if (!existingProject) {
      await prisma.project.create({
        data: {
          id: taskBoard.id,
          name: taskBoard.name,
          slug: taskBoard.slug,
          description: taskBoard.description,
          workspaceId: taskBoard.workspaceId,
          isDefault: taskBoard.isDefault,
          createdAt: taskBoard.createdAt,
          updatedAt: taskBoard.updatedAt,
          issuePrefix: taskBoard.issuePrefix,
          nextIssueNumbers: {
            EPIC: taskBoard.nextIssueNumber,
            STORY: taskBoard.nextIssueNumber,
            TASK: taskBoard.nextIssueNumber,
            BUG: taskBoard.nextIssueNumber,
            MILESTONE: taskBoard.nextIssueNumber,
            SUBTASK: taskBoard.nextIssueNumber
          }
        }
      })
      stats.projects++
      console.log(`  ✓ Migrated TaskBoard: ${taskBoard.name}`)
    }
  }
}

async function updateTaskColumnReferences(stats: MigrationStats) {
  // Update TaskColumn to reference Project instead of TaskBoard
  const columns = await prisma.taskColumn.findMany({
    where: {
      taskBoardId: { not: null },
      projectId: null
    }
  })
  
  let updated = 0
  for (const column of columns) {
    await prisma.taskColumn.update({
      where: { id: column.id },
      data: { projectId: column.taskBoardId }
    })
    updated++
  }
  
  stats.updatedColumns = updated
  console.log(`  ✓ Updated ${updated} TaskColumn references`)
}

async function migrateTaskToIssue(stats: MigrationStats) {
  const tasks = await prisma.task.findMany()
  
  for (const task of tasks) {
    // Check if Issue already exists
    const existingIssue = await prisma.issue.findUnique({
      where: { id: task.id }
    })

    if (!existingIssue) {
      await prisma.issue.create({
        data: {
          id: task.id,
          title: task.title,
          description: task.description,
          type: 'TASK',
          status: task.status,
          priority: task.priority,
          storyPoints: task.storyPoints,
          assigneeId: task.assigneeId,
          reporterId: task.reporterId,
          projectId: task.taskBoardId!,
          workspaceId: task.workspaceId,
          columnId: task.columnId,
          dueDate: task.dueDate,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          position: task.position,
          postId: task.postId
        }
      })
      stats.issues++
    }
  }
  console.log(`  ✓ Migrated ${tasks.length} Tasks to Issues`)
}

async function migrateEpicToIssue(stats: MigrationStats) {
  const epics = await prisma.epic.findMany()
  
  for (const epic of epics) {
    const existingIssue = await prisma.issue.findUnique({
      where: { id: epic.id }
    })

    if (!existingIssue) {
      await prisma.issue.create({
        data: {
          id: epic.id,
          title: epic.title,
          description: epic.description,
          type: 'EPIC',
          status: epic.status,
          priority: epic.priority,
          assigneeId: epic.assigneeId,
          reporterId: epic.reporterId,
          projectId: epic.taskBoardId,
          workspaceId: epic.workspaceId,
          columnId: epic.columnId,
          dueDate: epic.dueDate,
          startDate: epic.startDate,
          createdAt: epic.createdAt,
          updatedAt: epic.updatedAt,
          position: epic.position,
          progress: epic.progress,
          color: epic.color
        }
      })
      stats.issues++
    }
  }
  console.log(`  ✓ Migrated ${epics.length} Epics to Issues`)
}

async function migrateStoryToIssue(stats: MigrationStats) {
  const stories = await prisma.story.findMany()
  
  for (const story of stories) {
    const existingIssue = await prisma.issue.findUnique({
      where: { id: story.id }
    })

    if (!existingIssue) {
      await prisma.issue.create({
        data: {
          id: story.id,
          title: story.title,
          description: story.description,
          type: 'STORY',
          status: story.status,
          priority: story.priority,
          storyPoints: story.storyPoints,
          assigneeId: story.assigneeId,
          reporterId: story.reporterId,
          projectId: story.taskBoardId!,
          workspaceId: story.workspaceId,
          columnId: story.columnId,
          dueDate: story.dueDate,
          startDate: story.startDate,
          createdAt: story.createdAt,
          updatedAt: story.updatedAt,
          position: story.position,
          color: story.color
        }
      })
      stats.issues++
    }
  }
  console.log(`  ✓ Migrated ${stories.length} Stories to Issues`)
}

async function migrateMilestoneToIssue(stats: MigrationStats) {
  const milestones = await prisma.milestone.findMany()
  
  for (const milestone of milestones) {
    const existingIssue = await prisma.issue.findUnique({
      where: { id: milestone.id }
    })

    if (!existingIssue) {
      await prisma.issue.create({
        data: {
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          type: 'MILESTONE',
          status: milestone.status,
          assigneeId: milestone.assigneeId,
          reporterId: milestone.reporterId,
          projectId: milestone.taskBoardId,
          workspaceId: milestone.workspaceId,
          columnId: milestone.columnId,
          dueDate: milestone.dueDate,
          startDate: milestone.startDate,
          createdAt: milestone.createdAt,
          updatedAt: milestone.updatedAt,
          position: milestone.position,
          color: milestone.color
        }
      })
      stats.issues++
    }
  }
  console.log(`  ✓ Migrated ${milestones.length} Milestones to Issues`)
}

async function updateIssueParentRelationships(stats: MigrationStats) {
  let updated = 0

  // Update Story parent relationships (Stories belong to Epics)
  const storiesWithEpics = await prisma.story.findMany({
    where: { epicId: { not: null } }
  })

  for (const story of storiesWithEpics) {
    await prisma.issue.update({
      where: { id: story.id },
      data: { parentId: story.epicId }
    })
    updated++
  }

  // Update Task parent relationships (Tasks can belong to Stories)
  const tasksWithStories = await prisma.task.findMany({
    where: { storyId: { not: null } }
  })

  for (const task of tasksWithStories) {
    await prisma.issue.update({
      where: { id: task.id },
      data: { parentId: task.storyId }
    })
    updated++
  }

  // Handle Tasks that belong directly to Epics
  const tasksWithEpics = await prisma.task.findMany({
    where: { 
      epicId: { not: null },
      storyId: null
    }
  })

  for (const task of tasksWithEpics) {
    await prisma.issue.update({
      where: { id: task.id },
      data: { parentId: task.epicId }
    })
    updated++
  }

  stats.updatedRelationships = updated
  console.log(`  ✓ Updated ${updated} parent relationships`)
}

async function generateNewIssueKeys(stats: MigrationStats) {
  const projects = await prisma.project.findMany()
  
  for (const project of projects) {
    const typeCounters = {
      EPIC: 1,
      STORY: 1,
      TASK: 1,
      BUG: 1,
      MILESTONE: 1,
      SUBTASK: 1
    }

    const issues = await prisma.issue.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' }
    })

    for (const issue of issues) {
      const typePrefixMap: Record<string, string> = {
        EPIC: 'E',
        STORY: 'S',
        TASK: 'T',
        BUG: 'D',
        MILESTONE: 'M',
        SUBTASK: 'ST'
      }

      const typePrefix = typePrefixMap[issue.type]
      const newIssueKey = `${project.issuePrefix}-${typePrefix}${typeCounters[issue.type as keyof typeof typeCounters]}`
      
      await prisma.issue.update({
        where: { id: issue.id },
        data: { issueKey: newIssueKey }
      })

      typeCounters[issue.type as keyof typeof typeCounters]++
    }

    // Update project's next issue numbers
    await prisma.project.update({
      where: { id: project.id },
      data: { nextIssueNumbers: typeCounters }
    })

    console.log(`  ✓ Generated issue keys for project: ${project.name}`)
  }
}

async function createDefaultViews(stats: MigrationStats) {
  const projects = await prisma.project.findMany({
    include: { workspace: true }
  })

  for (const project of projects) {
    // Check if default view already exists
    const existingView = await prisma.view.findFirst({
      where: {
        projectIds: { has: project.id },
        isDefault: true
      }
    })

    if (!existingView) {
      await prisma.view.create({
        data: {
          name: `${project.name} - Default View`,
          description: `Default Kanban view for ${project.name}`,
          workspaceId: project.workspaceId,
          ownerId: project.workspace.ownerId,
          displayType: 'KANBAN',
          projectIds: [project.id],
          workspaceIds: [project.workspaceId],
          visibility: 'WORKSPACE',
          isDefault: true,
          filters: {},
          sorting: { field: 'position', direction: 'asc' },
          grouping: { field: 'status' },
          layout: { columns: 'auto' }
        }
      })
      stats.defaultViews++
      console.log(`  ✓ Created default view for: ${project.name}`)
    }
  }
}

async function verifyMigration() {
  const projectCount = await prisma.project.count()
  const issueCount = await prisma.issue.count()
  const viewCount = await prisma.view.count()
  
  const taskCount = await prisma.task.count()
  const epicCount = await prisma.epic.count()
  const storyCount = await prisma.story.count()
  const milestoneCount = await prisma.milestone.count()
  const taskBoardCount = await prisma.taskBoard.count()
  
  console.log('\nVerification Results:')
  console.log(`  Projects: ${projectCount}`)
  console.log(`  Issues: ${issueCount}`)
  console.log(`  Views: ${viewCount}`)
  console.log(`  Original TaskBoards: ${taskBoardCount}`)
  console.log(`  Original Tasks: ${taskCount}`)
  console.log(`  Original Epics: ${epicCount}`)
  console.log(`  Original Stories: ${storyCount}`)
  console.log(`  Original Milestones: ${milestoneCount}`)
  
  if (issueCount !== (taskCount + epicCount + storyCount + milestoneCount)) {
    console.warn('⚠️  Warning: Issue count does not match sum of original models')
  } else {
    console.log('✅ Data integrity verified - all items migrated correctly')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  }) 
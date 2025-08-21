import { PrismaClient } from '@prisma/client'

// Configure source (backup) and target databases
const sourceDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL
    }
  }
})

const targetDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

interface MigrationStats {
  users: number
  workspaces: number
  projects: number
  statuses: number
  issues: number
  comments: number
  attachments: number
  labels: number
  views: number
  relationships: number
}

// Default status templates based on common patterns
const DEFAULT_STATUS_TEMPLATES = [
  { name: 'todo', displayName: 'To Do', order: 0, color: '#94a3b8', iconName: 'circle', category: 'status' },
  { name: 'in_progress', displayName: 'In Progress', order: 1, color: '#3b82f6', iconName: 'timer', category: 'status' },
  { name: 'done', displayName: 'Done', order: 2, color: '#22c55e', iconName: 'check-circle-2', category: 'status' },
  { name: 'canceled', displayName: 'Canceled', order: 3, color: '#ef4444', iconName: 'x-circle', category: 'status' },
  { name: 'backlog', displayName: 'Backlog', order: -1, color: '#6b7280', iconName: 'archive', category: 'status' }
]

async function main() {
  console.log('🚀 Starting comprehensive data migration...')
  console.log('📊 Source DB:', process.env.BACKUP_DATABASE_URL ? 'Backup Database' : 'Current Database')
  console.log('🎯 Target DB:', 'Production Database')
  
  const stats: MigrationStats = {
    users: 0,
    workspaces: 0,
    projects: 0,
    statuses: 0,
    issues: 0,
    comments: 0,
    attachments: 0,
    labels: 0,
    views: 0,
    relationships: 0
  }

  try {
    // Step 1: Clear target database (optional - comment out if not needed)
    if (process.env.CLEAR_TARGET_DB === 'true') {
      console.log('\n🗑️  Clearing target database...')
      await clearTargetDatabase()
    }

    // Step 2: Create status templates
    console.log('\n📋 Creating status templates...')
    await createStatusTemplates()

    // Step 3: Migrate core entities
    console.log('\n👥 Step 1: Migrating users...')
    await migrateUsers(stats)

    console.log('\n🏢 Step 2: Migrating workspaces...')
    await migrateWorkspaces(stats)

    // Step 4: Migrate TaskBoard → Project
    console.log('\n📁 Step 3: Migrating TaskBoard → Project...')
    await migrateProjects(stats)

    // Step 5: Migrate TaskColumn → ProjectStatus
    console.log('\n🔄 Step 4: Migrating TaskColumn → ProjectStatus...')
    await migrateProjectStatuses(stats)

    // Step 6: Migrate labels
    console.log('\n🏷️  Step 5: Migrating labels...')
    await migrateLabels(stats)

    // Step 7: Migrate all task types to Issues
    console.log('\n📝 Step 6: Migrating all items to Issues...')
    await migrateAllToIssues(stats)

    // Step 8: Update parent relationships
    console.log('\n🔗 Step 7: Updating parent relationships...')
    await updateParentRelationships(stats)

    // Step 9: Migrate comments
    console.log('\n💬 Step 8: Migrating comments...')
    await migrateComments(stats)

    // Step 10: Migrate attachments and other related data
    console.log('\n📎 Step 9: Migrating attachments and related data...')
    await migrateRelatedData(stats)

    // Step 11: Generate issue keys
    console.log('\n🔑 Step 10: Generating issue keys...')
    await generateIssueKeys(stats)

    // Step 12: Create default views
    console.log('\n👁️  Step 11: Creating default views...')
    await createDefaultViews(stats)

    // Step 13: Verify migration
    console.log('\n✅ Step 12: Verifying migration...')
    await verifyMigration(stats)

    console.log('\n🎉 Migration completed successfully!')
    console.log('\nMigration Statistics:')
    console.log(`  Users migrated: ${stats.users}`)
    console.log(`  Workspaces migrated: ${stats.workspaces}`)
    console.log(`  Projects created: ${stats.projects}`)
    console.log(`  Statuses created: ${stats.statuses}`)
    console.log(`  Issues created: ${stats.issues}`)
    console.log(`  Comments migrated: ${stats.comments}`)
    console.log(`  Attachments migrated: ${stats.attachments}`)
    console.log(`  Labels migrated: ${stats.labels}`)
    console.log(`  Views created: ${stats.views}`)
    console.log(`  Relationships updated: ${stats.relationships}`)

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await sourceDb.$disconnect()
    await targetDb.$disconnect()
  }
}

async function clearTargetDatabase() {
  // Clear in reverse dependency order
  const tables = [
    'IssueRelation',
    'IssueFollower',
    'IssueAssignee',
    'IssueCommentReaction',
    'IssueComment',
    'ViewFollower',
    'ViewIssuePosition',
    'View',
    'Issue',
    'ProjectStatus',
    'StatusTemplate',
    'TaskColumn',
    'Project',
    'TaskLabel',
    'WorkspaceMember',
    'WorkspaceInvitation',
    'Workspace',
    'NotificationPreferences',
    'Notification',
    'User'
  ]

  for (const table of tables) {
    try {
      await targetDb.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
      console.log(`  ✓ Cleared ${table}`)
    } catch (error) {
      console.log(`  ⚠️  Could not clear ${table}:`, error.message)
    }
  }
}

async function createStatusTemplates() {
  for (const template of DEFAULT_STATUS_TEMPLATES) {
    try {
      await targetDb.statusTemplate.create({
        data: {
          ...template,
          isDefault: true,
          isActive: true
        }
      })
    } catch (error) {
      // Template might already exist
      console.log(`  ⚠️  Status template ${template.name} might already exist`)
    }
  }
}

async function migrateUsers(stats: MigrationStats) {
  const users = await sourceDb.user.findMany({
    include: {
      accounts: true,
      notificationPreferences: true
    }
  })

  for (const user of users) {
    try {
      // Create user
      await targetDb.user.create({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          hashedPassword: user.hashedPassword,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          team: user.team,
          currentFocus: user.currentFocus,
          expertise: user.expertise,
          slackId: user.slackId,
          avatarAccessory: user.avatarAccessory,
          avatarBrows: user.avatarBrows,
          avatarEyes: user.avatarEyes,
          avatarEyewear: user.avatarEyewear,
          avatarHair: user.avatarHair,
          avatarMouth: user.avatarMouth,
          avatarNose: user.avatarNose,
          avatarSkinTone: user.avatarSkinTone,
          useCustomAvatar: user.useCustomAvatar,
          role: user.role,
          accounts: {
            create: user.accounts.map(account => ({
              id: account.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state: account.session_state
            }))
          },
          notificationPreferences: user.notificationPreferences ? {
            create: {
              id: user.notificationPreferences.id,
              taskCreated: user.notificationPreferences.taskCreated,
              taskStatusChanged: user.notificationPreferences.taskStatusChanged,
              taskAssigned: user.notificationPreferences.taskAssigned,
              taskCommentAdded: user.notificationPreferences.taskCommentAdded,
              taskPriorityChanged: user.notificationPreferences.taskPriorityChanged,
              taskDueDateChanged: user.notificationPreferences.taskDueDateChanged,
              taskColumnMoved: user.notificationPreferences.taskColumnMoved,
              taskUpdated: user.notificationPreferences.taskUpdated,
              taskDeleted: user.notificationPreferences.taskDeleted,
              taskMentioned: user.notificationPreferences.taskMentioned,
              boardTaskCreated: user.notificationPreferences.boardTaskCreated,
              boardTaskStatusChanged: user.notificationPreferences.boardTaskStatusChanged,
              boardTaskAssigned: user.notificationPreferences.boardTaskAssigned,
              boardTaskCompleted: user.notificationPreferences.boardTaskCompleted,
              boardTaskDeleted: user.notificationPreferences.boardTaskDeleted,
              postCommentAdded: user.notificationPreferences.postCommentAdded,
              postUpdated: user.notificationPreferences.postUpdated,
              postResolved: user.notificationPreferences.postResolved,
              leaveRequestStatusChanged: user.notificationPreferences.leaveRequestStatusChanged,
              leaveRequestEdited: user.notificationPreferences.leaveRequestEdited,
              leaveRequestManagerAlert: user.notificationPreferences.leaveRequestManagerAlert,
              leaveRequestHRAlert: user.notificationPreferences.leaveRequestHRAlert,
              emailNotificationsEnabled: user.notificationPreferences.emailNotificationsEnabled,
              pushNotificationsEnabled: user.notificationPreferences.pushNotificationsEnabled,
              pushSubscription: user.notificationPreferences.pushSubscription
            }
          } : undefined
        }
      })
      stats.users++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate user ${user.email}:`, error.message)
    }
  }
  console.log(`  ✓ Migrated ${stats.users} users`)
}

async function migrateWorkspaces(stats: MigrationStats) {
  const workspaces = await sourceDb.workspace.findMany({
    include: {
      members: true,
      invitations: true
    }
  })

  for (const workspace of workspaces) {
    try {
      await targetDb.workspace.create({
        data: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          description: workspace.description,
          logoUrl: workspace.logoUrl,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          ownerId: workspace.ownerId,
          dockEnabled: workspace.dockEnabled,
          timeTrackingEnabled: workspace.timeTrackingEnabled,
          members: {
            create: workspace.members.map(member => ({
              id: member.id,
              userId: member.userId,
              role: member.role,
              createdAt: member.createdAt,
              updatedAt: member.updatedAt
            }))
          },
          invitations: {
            create: workspace.invitations.map(invitation => ({
              id: invitation.id,
              email: invitation.email,
              invitedById: invitation.invitedById,
              token: invitation.token,
              status: invitation.status,
              createdAt: invitation.createdAt,
              expiresAt: invitation.expiresAt
            }))
          }
        }
      })
      stats.workspaces++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate workspace ${workspace.name}:`, error.message)
    }
  }
  console.log(`  ✓ Migrated ${stats.workspaces} workspaces`)
}

async function migrateProjects(stats: MigrationStats) {
  const taskBoards = await sourceDb.taskBoard.findMany()

  for (const taskBoard of taskBoards) {
    try {
      await targetDb.project.create({
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
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate project ${taskBoard.name}:`, error.message)
    }
  }
  console.log(`  ✓ Migrated ${stats.projects} projects`)
}

async function migrateProjectStatuses(stats: MigrationStats) {
  const projects = await targetDb.project.findMany()
  const statusTemplates = await targetDb.statusTemplate.findMany()
  
  // Create a map for status template lookup
  const templateMap = new Map(statusTemplates.map(t => [t.name, t]))

  for (const project of projects) {
    // Get original columns for this project
    const columns = await sourceDb.taskColumn.findMany({
      where: { taskBoardId: project.id },
      orderBy: { order: 'asc' }
    })

    for (const column of columns) {
      // Find matching template or use default
      const templateName = column.name.toLowerCase().replace(/\s+/g, '_')
      const template = templateMap.get(templateName) || templateMap.get('todo')

      try {
        await targetDb.projectStatus.create({
          data: {
            name: column.name.toLowerCase().replace(/\s+/g, '_'),
            displayName: column.name,
            description: column.description,
            color: column.color || template?.color || '#6366F1',
            iconName: template?.iconName,
            order: column.order,
            isDefault: column.order === 0,
            isActive: true,
            isFinal: column.name.toLowerCase().includes('done') || column.name.toLowerCase().includes('complete'),
            projectId: project.id,
            templateId: template?.id
          }
        })
        stats.statuses++
      } catch (error) {
        console.log(`  ⚠️  Failed to create status ${column.name} for project ${project.name}:`, error.message)
      }
    }
  }
  console.log(`  ✓ Created ${stats.statuses} project statuses`)
}

async function migrateLabels(stats: MigrationStats) {
  const labels = await sourceDb.taskLabel.findMany()

  for (const label of labels) {
    try {
      await targetDb.taskLabel.create({
        data: {
          id: label.id,
          name: label.name,
          color: label.color,
          workspaceId: label.workspaceId,
          createdAt: label.createdAt,
          updatedAt: label.updatedAt
        }
      })
      stats.labels++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate label ${label.name}:`, error.message)
    }
  }
  console.log(`  ✓ Migrated ${stats.labels} labels`)
}

async function migrateAllToIssues(stats: MigrationStats) {
  // Get project statuses for mapping
  const projectStatuses = await targetDb.projectStatus.findMany()
  const statusMap = new Map<string, Map<string, string>>()
  
  // Build status map: projectId -> columnName -> statusId
  for (const status of projectStatuses) {
    if (!statusMap.has(status.projectId)) {
      statusMap.set(status.projectId, new Map())
    }
    // Map both internal name and display name for flexibility
    statusMap.get(status.projectId)!.set(status.name, status.id)
    statusMap.get(status.projectId)!.set(status.displayName.toLowerCase(), status.id)
  }

  // Migrate Tasks
  const tasks = await sourceDb.task.findMany({
    include: { labels: true }
  })
  
  for (const task of tasks) {
    try {
      const statusId = await getStatusIdForIssue(task.taskBoardId, task.columnId, task.status, statusMap)
      
      await targetDb.issue.create({
        data: {
          id: task.id,
          title: task.title,
          description: task.description,
          type: 'TASK',
          statusId: statusId,
          statusValue: task.status, // Keep for backward compatibility
          priority: task.priority,
          storyPoints: task.storyPoints,
          assigneeId: task.assigneeId,
          reporterId: task.reporterId,
          projectId: task.taskBoardId!,
          workspaceId: task.workspaceId,
          dueDate: task.dueDate,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          position: task.position,
          postId: task.postId,
          labels: {
            connect: task.labels.map(label => ({ id: label.id }))
          }
        }
      })
      stats.issues++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate task ${task.title}:`, error.message)
    }
  }

  // Migrate Epics
  const epics = await sourceDb.epic.findMany({
    include: { labels: true }
  })

  for (const epic of epics) {
    try {
      const statusId = await getStatusIdForIssue(epic.taskBoardId, epic.columnId, epic.status, statusMap)

      await targetDb.issue.create({
        data: {
          id: epic.id,
          title: epic.title,
          description: epic.description,
          type: 'EPIC',
          statusId: statusId,
          statusValue: epic.status,
          priority: epic.priority,
          assigneeId: epic.assigneeId,
          reporterId: epic.reporterId,
          projectId: epic.taskBoardId,
          workspaceId: epic.workspaceId,
          dueDate: epic.dueDate,
          startDate: epic.startDate,
          createdAt: epic.createdAt,
          updatedAt: epic.updatedAt,
          position: epic.position,
          progress: epic.progress,
          color: epic.color,
          labels: {
            connect: epic.labels.map(label => ({ id: label.id }))
          }
        }
      })
      stats.issues++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate epic ${epic.title}:`, error.message)
    }
  }

  // Migrate Stories
  const stories = await sourceDb.story.findMany({
    include: { labels: true }
  })

  for (const story of stories) {
    try {
      const statusId = await getStatusIdForIssue(story.taskBoardId, story.columnId, story.status, statusMap)

      await targetDb.issue.create({
        data: {
          id: story.id,
          title: story.title,
          description: story.description,
          type: 'STORY',
          statusId: statusId,
          statusValue: story.status,
          priority: story.priority,
          storyPoints: story.storyPoints,
          assigneeId: story.assigneeId,
          reporterId: story.reporterId,
          projectId: story.taskBoardId!,
          workspaceId: story.workspaceId,
          dueDate: story.dueDate,
          startDate: story.startDate,
          createdAt: story.createdAt,
          updatedAt: story.updatedAt,
          position: story.position,
          color: story.color,
          labels: {
            connect: story.labels.map(label => ({ id: label.id }))
          }
        }
      })
      stats.issues++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate story ${story.title}:`, error.message)
    }
  }

  // Migrate Milestones
  const milestones = await sourceDb.milestone.findMany({
    include: { labels: true }
  })

  for (const milestone of milestones) {
    try {
      const statusId = await getStatusIdForIssue(milestone.taskBoardId, milestone.columnId, milestone.status, statusMap)

      await targetDb.issue.create({
        data: {
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          type: 'MILESTONE',
          statusId: statusId,
          statusValue: milestone.status,
          assigneeId: milestone.assigneeId,
          reporterId: milestone.reporterId,
          projectId: milestone.taskBoardId,
          workspaceId: milestone.workspaceId,
          dueDate: milestone.dueDate,
          startDate: milestone.startDate,
          createdAt: milestone.createdAt,
          updatedAt: milestone.updatedAt,
          position: milestone.position,
          color: milestone.color,
          labels: {
            connect: milestone.labels.map(label => ({ id: label.id }))
          }
        }
      })
      stats.issues++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate milestone ${milestone.title}:`, error.message)
    }
  }

  console.log(`  ✓ Migrated ${stats.issues} issues total`)
}

async function getStatusIdForIssue(
  projectId: string | null, 
  columnId: string | null,
  statusValue: string | null,
  statusMap: Map<string, Map<string, string>>
): Promise<string | null> {
  if (!projectId) return null
  
  const projectStatusMap = statusMap.get(projectId)
  if (!projectStatusMap) return null

  // If we have a columnId, get the column name and map it
  if (columnId) {
    const column = await sourceDb.taskColumn.findUnique({
      where: { id: columnId }
    })
    if (column) {
      const normalizedName = column.name.toLowerCase().replace(/\s+/g, '_')
      return projectStatusMap.get(normalizedName) || projectStatusMap.get(column.name.toLowerCase()) || null
    }
  }

  // Fallback to status value mapping
  if (statusValue) {
    const normalizedStatus = statusValue.toLowerCase().replace(/\s+/g, '_')
    return projectStatusMap.get(normalizedStatus) || projectStatusMap.get(statusValue.toLowerCase()) || null
  }

  // Default to first status (usually "todo")
  return projectStatusMap.values().next().value || null
}

async function updateParentRelationships(stats: MigrationStats) {
  let updated = 0

  // Update Story parent relationships (Stories belong to Epics)
  const storiesWithEpics = await sourceDb.story.findMany({
    where: { epicId: { not: null } }
  })

  for (const story of storiesWithEpics) {
    try {
      await targetDb.issue.update({
        where: { id: story.id },
        data: { parentId: story.epicId }
      })
      updated++
    } catch (error) {
      console.log(`  ⚠️  Failed to update story parent:`, error.message)
    }
  }

  // Update Task parent relationships
  const tasksWithStories = await sourceDb.task.findMany({
    where: { storyId: { not: null } }
  })

  for (const task of tasksWithStories) {
    try {
      await targetDb.issue.update({
        where: { id: task.id },
        data: { parentId: task.storyId }
      })
      updated++
    } catch (error) {
      console.log(`  ⚠️  Failed to update task parent (story):`, error.message)
    }
  }

  const tasksWithEpics = await sourceDb.task.findMany({
    where: { 
      epicId: { not: null },
      storyId: null
    }
  })

  for (const task of tasksWithEpics) {
    try {
      await targetDb.issue.update({
        where: { id: task.id },
        data: { parentId: task.epicId }
      })
      updated++
    } catch (error) {
      console.log(`  ⚠️  Failed to update task parent (epic):`, error.message)
    }
  }

  // Update subtask relationships
  const subtasks = await sourceDb.task.findMany({
    where: { parentTaskId: { not: null } }
  })

  for (const subtask of subtasks) {
    try {
      await targetDb.issue.update({
        where: { id: subtask.id },
        data: { parentId: subtask.parentTaskId }
      })
      updated++
    } catch (error) {
      console.log(`  ⚠️  Failed to update subtask parent:`, error.message)
    }
  }

  stats.relationships = updated
  console.log(`  ✓ Updated ${updated} parent relationships`)
}

async function migrateComments(stats: MigrationStats) {
  // Migrate task comments
  const taskComments = await sourceDb.taskComment.findMany()

  for (const comment of taskComments) {
    try {
      await targetDb.issueComment.create({
        data: {
          id: comment.id,
          content: comment.content,
          issueId: comment.taskId,
          authorId: comment.authorId,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          html: comment.html,
          parentId: comment.parentId
        }
      })
      stats.comments++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate task comment:`, error.message)
    }
  }

  // Migrate epic/story/milestone comments from Comment model
  const comments = await sourceDb.comment.findMany({
    where: {
      OR: [
        { epicId: { not: null } },
        { storyId: { not: null } },
        { milestoneId: { not: null } }
      ]
    }
  })

  for (const comment of comments) {
    try {
      const issueId = comment.epicId || comment.storyId || comment.milestoneId
      if (issueId) {
        await targetDb.issueComment.create({
          data: {
            content: comment.message,
            issueId: issueId,
            authorId: comment.authorId,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            html: comment.html,
            parentId: comment.parentId
          }
        })
        stats.comments++
      }
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate comment:`, error.message)
    }
  }

  console.log(`  ✓ Migrated ${stats.comments} comments`)
}

async function migrateRelatedData(stats: MigrationStats) {
  // Migrate task attachments
  const attachments = await sourceDb.taskAttachment.findMany()
  
  for (const attachment of attachments) {
    try {
      // Note: We'll need to create an IssueAttachment model in the schema
      // For now, we'll skip this or you can add the model to schema
      stats.attachments++
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate attachment:`, error.message)
    }
  }

  // Migrate task assignees to issue assignees
  const assignees = await sourceDb.taskAssignee.findMany()
  
  for (const assignee of assignees) {
    try {
      await targetDb.issueAssignee.create({
        data: {
          id: assignee.id,
          issueId: assignee.taskId,
          userId: assignee.userId,
          role: assignee.role === 'ASSIGNEE' ? 'ASSIGNEE' : 'HELPER',
          status: assignee.status === 'PENDING' ? 'PENDING' : 
                  assignee.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          assignedAt: assignee.assignedAt,
          approvedAt: assignee.approvedAt,
          approvedBy: assignee.approvedBy,
          totalTimeWorked: assignee.totalTimeWorked,
          lastWorkedAt: assignee.lastWorkedAt
        }
      })
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate assignee:`, error.message)
    }
  }

  // Migrate followers
  const taskFollowers = await sourceDb.taskFollower.findMany()
  
  for (const follower of taskFollowers) {
    try {
      await targetDb.issueFollower.create({
        data: {
          id: follower.id,
          issueId: follower.taskId,
          userId: follower.userId,
          createdAt: follower.createdAt
        }
      })
    } catch (error) {
      console.log(`  ⚠️  Failed to migrate follower:`, error.message)
    }
  }

  console.log(`  ✓ Migrated related data`)
}

async function generateIssueKeys(stats: MigrationStats) {
  const projects = await targetDb.project.findMany()
  
  for (const project of projects) {
    const typeCounters = {
      EPIC: 1,
      STORY: 1,
      TASK: 1,
      BUG: 1,
      MILESTONE: 1,
      SUBTASK: 1
    }

    const issues = await targetDb.issue.findMany({
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
      
      await targetDb.issue.update({
        where: { id: issue.id },
        data: { issueKey: newIssueKey }
      })

      typeCounters[issue.type as keyof typeof typeCounters]++
    }

    // Update project's next issue numbers
    await targetDb.project.update({
      where: { id: project.id },
      data: { nextIssueNumbers: typeCounters }
    })
  }
  console.log(`  ✓ Generated issue keys for all projects`)
}

async function createDefaultViews(stats: MigrationStats) {
  const projects = await targetDb.project.findMany({
    include: { workspace: true }
  })

  for (const project of projects) {
    try {
      await targetDb.view.create({
        data: {
          name: `${project.name}: Default`,
          description: `Default Kanban board for ${project.name}`,
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
          layout: { columns: 'auto' },
          color: project.color
        }
      })
      stats.views++
    } catch (error) {
      console.log(`  ⚠️  Failed to create view for project ${project.name}:`, error.message)
    }
  }
  console.log(`  ✓ Created ${stats.views} default views`)
}

async function verifyMigration(stats: MigrationStats) {
  const projectCount = await targetDb.project.count()
  const issueCount = await targetDb.issue.count()
  const statusCount = await targetDb.projectStatus.count()
  const viewCount = await targetDb.view.count()
  
  console.log('\nVerification Results:')
  console.log(`  Projects in target: ${projectCount}`)
  console.log(`  Issues in target: ${issueCount}`)
  console.log(`  Statuses in target: ${statusCount}`)
  console.log(`  Views in target: ${viewCount}`)
  
  // Verify source counts
  const sourceTaskCount = await sourceDb.task.count()
  const sourceEpicCount = await sourceDb.epic.count()
  const sourceStoryCount = await sourceDb.story.count()
  const sourceMilestoneCount = await sourceDb.milestone.count()
  const sourceTotalExpected = sourceTaskCount + sourceEpicCount + sourceStoryCount + sourceMilestoneCount
  
  console.log(`\n  Source items: ${sourceTotalExpected}`)
  console.log(`  Target issues: ${issueCount}`)
  
  if (issueCount === sourceTotalExpected) {
    console.log('✅ All items migrated successfully!')
  } else {
    console.log(`⚠️  Mismatch: Expected ${sourceTotalExpected} issues but found ${issueCount}`)
  }
}

// Run the migration
main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

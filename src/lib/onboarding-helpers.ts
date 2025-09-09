import { prisma } from "@/lib/prisma";
import { ensureDefaultStatusTemplates } from "@/lib/seed-status-templates";

/**
 * Automatically creates a Personal Workspace with a Default Project and View for a new user
 * This function is called during user registration/sign-in to ensure every user has a workspace
 * 
 * @param userId - The ID of the newly created user
 * @param userName - The name of the user (used for workspace naming)
 * @returns The created workspace with project and view information
 */
export async function createPersonalWorkspaceForUser(userId: string, userName: string) {
  // Ensure default status templates exist before creating workspace
  await ensureDefaultStatusTemplates();
  
  return await prisma.$transaction(async (tx) => {
    // 1. Create the Personal Workspace
    const workspaceName = `${userName}'s Personal Workspace`;
    const workspaceSlug = `${userName.toLowerCase().replace(/\s+/g, '-')}-personal`;
    
    // Ensure unique slug by adding number suffix if needed
    let finalWorkspaceSlug = workspaceSlug;
    let slugCounter = 1;
    
    while (true) {
      const existingWorkspace = await tx.workspace.findUnique({
        where: { slug: finalWorkspaceSlug }
      });
      
      if (!existingWorkspace) {
        break;
      }
      
      finalWorkspaceSlug = `${workspaceSlug}-${slugCounter}`;
      slugCounter++;
    }

    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        slug: finalWorkspaceSlug,
        description: `Personal workspace for ${userName}`,
        ownerId: userId,
        members: {
          create: {
            userId: userId,
            role: 'owner',
            status: true
          }
        }
      }
    });

    // 2. Create the Default Project
    const projectName = "Default Project";
    const projectSlug = "default-project";
    const issuePrefix = "DEF";
    
    // Ensure unique project slug within workspace
    let finalProjectSlug = projectSlug;
    let projectSlugCounter = 1;
    
    while (true) {
      const existingProject = await tx.project.findFirst({
        where: { 
          slug: finalProjectSlug,
          workspaceId: workspace.id
        }
      });
      
      if (!existingProject) {
        break;
      }
      
      finalProjectSlug = `${projectSlug}-${projectSlugCounter}`;
      projectSlugCounter++;
    }

    const project = await tx.project.create({
      data: {
        name: projectName,
        slug: finalProjectSlug,
        description: "Default project for getting started",
        color: "#3b82f6", // Blue color
        issuePrefix: issuePrefix,
        isDefault: true,
        workspaceId: workspace.id,
        nextIssueNumbers: {
          EPIC: 1,
          STORY: 1,
          TASK: 1,
          BUG: 1,
          MILESTONE: 1,
          SUBTASK: 1
        }
      }
    });

    // 3. Create default statuses for the project
    const defaultStatuses = await tx.statusTemplate.findMany({
      where: { isDefault: true },
      orderBy: { order: 'asc' }
    });

    if (defaultStatuses.length > 0) {
      await tx.projectStatus.createMany({
        data: defaultStatuses.map(status => ({
          name: status.name,
          displayName: status.displayName,
          color: status.color,
          order: status.order,
          isDefault: status.isDefault,
          isFinal: status.name === 'done' || status.name === 'completed',
          iconName: status.iconName,
          projectId: project.id,
          templateId: status.id
        }))
      });
    }

    // 4. Create the Default View for the project
    const viewName = `${projectName} - Default View`;
    let finalViewSlug = "default-view";
    let viewSlugCounter = 1;
    
    // Ensure unique view slug within workspace
    while (true) {
      const existingView = await tx.view.findFirst({
        where: { 
          slug: finalViewSlug,
          workspaceId: workspace.id
        }
      });
      
      if (!existingView) {
        break;
      }
      
      finalViewSlug = `default-view-${viewSlugCounter}`;
      viewSlugCounter++;
    }

    const view = await tx.view.create({
      data: {
        name: viewName,
        slug: finalViewSlug,
        description: `Default Kanban view for ${projectName}`,
        workspaceId: workspace.id,
        ownerId: userId,
        displayType: 'KANBAN',
        projectIds: [project.id],
        workspaceIds: [workspace.id],
        visibility: 'PERSONAL',
        isDefault: true,
        isFavorite: true,
        filters: {},
        sorting: { 
          field: 'position', 
          direction: 'asc' 
        },
        grouping: { 
          field: 'status' 
        },
        layout: { 
          columns: 'auto',
          showSubtasks: true,
          showEmptyStates: true
        },
        fields: {
          title: { visible: true, width: 'auto' },
          assignee: { visible: true, width: 'auto' },
          status: { visible: true, width: 'auto' },
          priority: { visible: true, width: 'auto' },
          dueDate: { visible: false, width: 'auto' },
          storyPoints: { visible: false, width: 'auto' },
          labels: { visible: true, width: 'auto' }
        }
      }
    });

    // 5. Create a welcome task/issue to help user get started
    const welcomeIssue = await tx.issue.create({
      data: {
        title: "Welcome to your personal workspace! 👋",
        description: `Hi ${userName}! 

Welcome to your personal workspace. This is your own space where you can:

- Create and manage tasks
- Track your personal projects
- Organize your work with different views
- Collaborate when you're ready to invite others

**Getting Started:**
1. Create your first task by clicking the "+" button
2. Try different view types (Kanban, List, Table)
3. Customize your workspace settings
4. Invite team members when ready

Feel free to edit or delete this welcome message once you're comfortable with the system.

Happy organizing! ✨`,
        type: 'TASK',
        priority: "medium",
        assigneeId: userId,
        reporterId: userId,
        projectId: project.id,
        workspaceId: workspace.id,
        issueKey: `${issuePrefix}-1`,
        position: 1000
      }
    });

    // Update the project's next issue numbers
    await tx.project.update({
      where: { id: project.id },
      data: {
        nextIssueNumbers: {
          EPIC: 1,
          STORY: 1,
          TASK: 2, // We created one task
          BUG: 1,
          MILESTONE: 1,
          SUBTASK: 1
        }
      }
    });

    // Set up user's notification preferences for the new workspace
    await tx.notificationPreferences.upsert({
      where: { userId },
      create: {
        userId,
        // Default to minimal notifications for personal workspace
        taskCreated: true,
        taskStatusChanged: true,
        taskAssigned: true,
        taskCommentAdded: true,
        taskPriorityChanged: false,
        taskDueDateChanged: true,
        taskColumnMoved: false,
        taskUpdated: false,
        taskDeleted: false,
        taskMentioned: true,
        
        boardTaskCreated: false,
        boardTaskStatusChanged: false,
        boardTaskAssigned: false,
        boardTaskCompleted: true,
        boardTaskDeleted: false,
        
        postCommentAdded: true,
        postUpdated: false,
        postResolved: true,
        
        leaveRequestStatusChanged: true,
        leaveRequestEdited: false,
        leaveRequestManagerAlert: false,
        leaveRequestHRAlert: false,
        
        emailNotificationsEnabled: true,
        pushNotificationsEnabled: false
      },
      update: {} // Don't update if already exists
    });

    return {
      workspace,
      project,
      view,
      welcomeIssue
    };
  });
}

/**
 * Check if a user already has at least one workspace
 * Used to determine if we should create a personal workspace
 */
export async function userHasWorkspace(userId: string): Promise<boolean> {
  const workspaceCount = await prisma.workspace.count({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId, status: true } } }
      ]
    }
  });
  
  return workspaceCount > 0;
}

/**
 * Creates a slugified version of a string suitable for URLs
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

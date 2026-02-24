import type Anthropic from '@anthropic-ai/sdk';

/**
 * AI Tool definitions for the assistant.
 * These mirror key capabilities from the MCP server.
 */

// Tool input types
export interface FindIssuesInput {
  query?: string;
  projectId?: string;
  type?: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'MILESTONE' | 'SUBTASK';
  status?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  assigneeName?: string;
  isOverdue?: boolean;
  isUnassigned?: boolean;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface GetWorkloadInput {
  assigneeId?: string;
  assigneeName?: string;
}

export interface GetProjectInfoInput {
  projectId?: string;
  projectName?: string;
}

export interface SearchUsersInput {
  query: string;
}

export interface GetIssueDetailsInput {
  issueKey: string;
}

export interface BuildViewInput {
  name: string;
  displayType?: 'KANBAN' | 'LIST' | 'TABLE';
  grouping?: 'status' | 'assignee' | 'priority' | 'type' | 'project';
  filters?: {
    type?: ('EPIC' | 'STORY' | 'TASK' | 'BUG' | 'MILESTONE' | 'SUBTASK')[];
    status?: string[];
    priority?: ('low' | 'medium' | 'high' | 'urgent')[];
    assignee?: string[]; // User IDs or names
    assigneeNames?: string[]; // User names for lookup
    isOverdue?: boolean;
    isUnassigned?: boolean;
    labels?: string[];
    dueDate?: ('overdue' | 'today' | 'this-week')[];
    updatedAt?: ('today' | 'last-7-days' | 'last-30-days')[];
    createdAt?: ('today' | 'last-7-days' | 'last-30-days')[];
  };
  projectIds?: string[];
  projectNames?: string[]; // Project names for lookup
}

// Tool definitions for Anthropic
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_issues',
    description: `Search and filter issues in the workspace. Use this to find issues by text query, project, type, status, priority, assignee, or other criteria.

Examples:
- Find all bugs: type="BUG"
- Find high priority tasks: type="TASK", priority="high"
- Find issues assigned to someone: assigneeName="John"
- Find overdue issues: isOverdue=true
- Find unassigned issues: isUnassigned=true
- Search by text: query="login error"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Text search across issue title, description, and key',
        },
        projectId: {
          type: 'string',
          description: 'Filter by project ID',
        },
        type: {
          type: 'string',
          enum: ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'],
          description: 'Filter by issue type',
        },
        status: {
          type: 'string',
          description: 'Filter by status name (e.g., "In Progress", "Done")',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Filter by priority',
        },
        assigneeId: {
          type: 'string',
          description: 'Filter by assignee user ID',
        },
        assigneeName: {
          type: 'string',
          description: 'Filter by assignee name (partial match)',
        },
        isOverdue: {
          type: 'boolean',
          description: 'Only show overdue issues',
        },
        isUnassigned: {
          type: 'boolean',
          description: 'Only show unassigned issues',
        },
        limit: {
          type: 'number',
          description: 'Max number of results (default 20, max 50)',
        },
        sortBy: {
          type: 'string',
          enum: ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title'],
          description: 'Sort field',
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction',
        },
      },
    },
  },
  {
    name: 'get_workload',
    description: `Get workload information for team members. Shows issue counts by status for each assignee.
Use this to answer questions about team capacity, who is overloaded, or a specific person's workload.

If no assignee specified, returns workload for all team members.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        assigneeId: {
          type: 'string',
          description: 'Filter to specific assignee by ID',
        },
        assigneeName: {
          type: 'string',
          description: 'Filter to specific assignee by name (partial match)',
        },
      },
    },
  },
  {
    name: 'get_workspace_stats',
    description: `Get overall workspace statistics including total issues, projects, members, and breakdown by status and priority.
Use this for workspace overview questions or when comparing metrics.`,
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_project_info',
    description: `Get detailed information about a specific project including issue counts, recent activity, and team members.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        projectName: {
          type: 'string',
          description: 'Project name (partial match)',
        },
      },
    },
  },
  {
    name: 'search_users',
    description: `Search for workspace members by name or email. Returns user details and their current workload summary.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query for name or email',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_issue_details',
    description: `Get detailed information about a specific issue by its key (e.g., "PROJ-123").
Includes full description, comments, activity history, and related issues.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g., "PROJ-123")',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'get_recent_activity',
    description: `Get recent activity in the workspace. Shows recent issue updates, comments, status changes, and assignments.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of activities to return (default 20, max 50)',
        },
        userId: {
          type: 'string',
          description: 'Filter to specific user by ID',
        },
        userName: {
          type: 'string',
          description: 'Filter to specific user by name',
        },
      },
    },
  },
  {
    name: 'build_view',
    description: `Build and open a dynamic view with specified filters. Use this when users want to see a custom filtered view of issues.

This tool creates a dynamic view URL and navigates the user there. The view can be saved by the user if they want to keep it.

Examples:
- "Show me all bugs" → build_view with filters.type=["BUG"]
- "Show high priority tasks assigned to John" → build_view with filters.type=["TASK"], filters.priority=["high"], filters.assigneeNames=["John"]
- "Create a kanban of overdue issues" → build_view with displayType="KANBAN", filters.isOverdue=true
- "Show my in-progress work" → build_view with filters.status=["In Progress"], filters.assignee=["current_user"]

Display type selection:
- KANBAN: Best for workflow visualization, sprint planning, status-based views
- LIST: Best for task lists, backlogs, filtered results
- TABLE: Best for detailed data, bulk operations

Grouping options (for KANBAN):
- status: Group by issue status (default)
- assignee: Group by who's assigned
- priority: Group by priority level
- type: Group by issue type`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'A descriptive name for the view (e.g., "High Priority Bugs", "My Tasks")',
        },
        displayType: {
          type: 'string',
          enum: ['KANBAN', 'LIST', 'TABLE'],
          description: 'How to display the view. KANBAN for boards, LIST for simple lists, TABLE for detailed grids.',
        },
        grouping: {
          type: 'string',
          enum: ['status', 'assignee', 'priority', 'type', 'project'],
          description: 'Field to group issues by (primarily for KANBAN views)',
        },
        filters: {
          type: 'object',
          description: 'Filter criteria for the view',
          properties: {
            type: {
              type: 'array',
              items: { type: 'string', enum: ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'] },
              description: 'Filter by issue types',
            },
            status: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by status names (e.g., ["In Progress", "In Review"])',
            },
            priority: {
              type: 'array',
              items: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
              description: 'Filter by priority levels',
            },
            assignee: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by assignee user IDs. Use "current_user" for the requesting user, "unassigned" for unassigned issues.',
            },
            assigneeNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by assignee names (will be resolved to IDs)',
            },
            isOverdue: {
              type: 'boolean',
              description: 'Show only overdue issues',
            },
            isUnassigned: {
              type: 'boolean',
              description: 'Show only unassigned issues',
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by label IDs or names',
            },
            dueDate: {
              type: 'array',
              items: { type: 'string', enum: ['overdue', 'today', 'this-week'] },
              description: 'Filter by due date ranges',
            },
            updatedAt: {
              type: 'array',
              items: { type: 'string', enum: ['today', 'last-7-days', 'last-30-days'] },
              description: 'Filter by when issues were last updated',
            },
            createdAt: {
              type: 'array',
              items: { type: 'string', enum: ['today', 'last-7-days', 'last-30-days'] },
              description: 'Filter by when issues were created',
            },
          },
        },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Limit to specific project IDs (empty = all projects)',
        },
        projectNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Limit to specific projects by name (will be resolved to IDs)',
        },
      },
      required: ['name'],
    },
  },
];

/**
 * Execute a tool and return the result.
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: { workspaceId: string; workspaceSlug?: string; userId?: string; prisma: any }
): Promise<string> {
  const { workspaceId, prisma } = context;

  try {
    switch (toolName) {
      case 'find_issues':
        return await findIssues(toolInput as FindIssuesInput, workspaceId, prisma);

      case 'get_workload':
        return await getWorkload(toolInput as GetWorkloadInput, workspaceId, prisma);

      case 'get_workspace_stats':
        return await getWorkspaceStats(workspaceId, prisma);

      case 'get_project_info':
        return await getProjectInfo(toolInput as GetProjectInfoInput, workspaceId, prisma);

      case 'search_users':
        return await searchUsers(toolInput as unknown as SearchUsersInput, workspaceId, prisma);

      case 'get_issue_details':
        return await getIssueDetails(toolInput as unknown as GetIssueDetailsInput, workspaceId, prisma);

      case 'get_recent_activity':
        return await getRecentActivity(toolInput as any, workspaceId, prisma);

      case 'build_view':
        return await buildView(toolInput as unknown as BuildViewInput, workspaceId, prisma, context);

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return JSON.stringify({ error: `Tool execution failed: ${(error as Error).message}` });
  }
}

// --- Tool Implementations ---

async function findIssues(
  input: FindIssuesInput,
  workspaceId: string,
  prisma: any
): Promise<string> {
  const where: any = { workspaceId };
  const limit = Math.min(input.limit || 20, 50);

  // Text search
  if (input.query) {
    where.OR = [
      { title: { contains: input.query, mode: 'insensitive' } },
      { description: { contains: input.query, mode: 'insensitive' } },
      { issueKey: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  // Project filter
  if (input.projectId) {
    where.projectId = input.projectId;
  }

  // Type filter
  if (input.type) {
    where.type = input.type;
  }

  // Status filter (by name)
  if (input.status) {
    where.projectStatus = { name: { contains: input.status, mode: 'insensitive' } };
  }

  // Priority filter
  if (input.priority) {
    where.priority = input.priority;
  }

  // Assignee filter
  if (input.assigneeId) {
    where.assigneeId = input.assigneeId;
  } else if (input.assigneeName) {
    where.assignee = { name: { contains: input.assigneeName, mode: 'insensitive' } };
  }

  // Overdue filter
  if (input.isOverdue) {
    where.dueDate = { lt: new Date() };
    where.projectStatus = { ...where.projectStatus, isFinal: false };
  }

  // Unassigned filter
  if (input.isUnassigned) {
    where.assigneeId = null;
  }

  // Build orderBy
  const orderBy: any = {};
  if (input.sortBy) {
    orderBy[input.sortBy] = input.sortOrder || 'desc';
  } else {
    orderBy.updatedAt = 'desc';
  }

  const issues = await prisma.issue.findMany({
    where,
    take: limit,
    orderBy,
    select: {
      id: true,
      issueKey: true,
      title: true,
      type: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true, issuePrefix: true } },
      projectStatus: { select: { name: true, color: true } },
      assignee: { select: { id: true, name: true, email: true } },
      reporter: { select: { name: true } },
      labels: { select: { name: true, color: true } },
      _count: { select: { comments: true, children: true } },
    },
  });

  const total = await prisma.issue.count({ where });

  // Format issues with interactive markers
  const formatted = issues.map((issue: any) => ({
    key: issue.issueKey,
    title: issue.title,
    type: issue.type,
    status: issue.projectStatus?.name || 'Unknown',
    priority: issue.priority,
    assignee: issue.assignee?.name || 'Unassigned',
    project: issue.project?.name,
    dueDate: issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : null,
    labels: issue.labels?.map((l: any) => l.name) || [],
    comments: issue._count.comments,
    subtasks: issue._count.children,
    updatedAt: new Date(issue.updatedAt).toLocaleDateString(),
  }));

  // Generate interactive issue list marker for the AI to include in response
  const issueListMarker = `[ISSUE_LIST:${JSON.stringify(formatted)}]`;

  return JSON.stringify({
    total,
    returned: formatted.length,
    issues: formatted,
    _interactiveMarker: issueListMarker,
    _hint: 'Include the _interactiveMarker value in your response to render interactive issue cards. You can also reference individual issues using [ISSUE:key="PROJ-123" title="..." status="..." priority="..." type="..." assignee="..."] format.',
  });
}

async function getWorkload(
  input: GetWorkloadInput,
  workspaceId: string,
  prisma: any
): Promise<string> {
  // Get all workspace members
  let memberFilter: any = { workspaceId, status: true };

  // If searching by name, find the user first
  if (input.assigneeName) {
    memberFilter.user = { name: { contains: input.assigneeName, mode: 'insensitive' } };
  } else if (input.assigneeId) {
    memberFilter.userId = input.assigneeId;
  }

  const members = await prisma.workspaceMember.findMany({
    where: memberFilter,
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const workloadData = await Promise.all(
    members.map(async (member: any) => {
      // Get issue counts by status for this assignee
      const issues = await prisma.issue.findMany({
        where: {
          workspaceId,
          assigneeId: member.userId,
          projectStatus: { isFinal: false }, // Only active issues
        },
        select: {
          id: true,
          issueKey: true,
          title: true,
          priority: true,
          dueDate: true,
          type: true,
          projectStatus: { select: { name: true } },
        },
      });

      // Group by status
      const byStatus: Record<string, number> = {};
      let overdueCount = 0;
      let highPriorityCount = 0;
      const overdueIssues: any[] = [];
      const highPriorityIssues: any[] = [];

      for (const issue of issues) {
        const statusName = issue.projectStatus?.name || 'Unknown';
        byStatus[statusName] = (byStatus[statusName] || 0) + 1;

        if (issue.dueDate && new Date(issue.dueDate) < new Date()) {
          overdueCount++;
          overdueIssues.push({
            key: issue.issueKey,
            title: issue.title,
            status: statusName,
            priority: issue.priority,
            type: issue.type,
          });
        }
        if (issue.priority === 'high' || issue.priority === 'urgent') {
          highPriorityCount++;
          highPriorityIssues.push({
            key: issue.issueKey,
            title: issue.title,
            status: statusName,
            priority: issue.priority,
            type: issue.type,
          });
        }
      }

      // Get completed this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const completedThisWeek = await prisma.issue.count({
        where: {
          workspaceId,
          assigneeId: member.userId,
          projectStatus: { isFinal: true },
          updatedAt: { gte: weekAgo },
        },
      });

      return {
        id: member.userId,
        name: member.user.name,
        email: member.user.email,
        totalActive: issues.length,
        byStatus,
        overdue: overdueCount,
        overdueIssues: overdueIssues.slice(0, 5),
        highPriority: highPriorityCount,
        highPriorityIssues: highPriorityIssues.slice(0, 5),
        completedThisWeek,
      };
    })
  );

  // Sort by total active issues (most loaded first)
  workloadData.sort((a, b) => b.totalActive - a.totalActive);

  // Generate interactive marker
  const userWorkloadMarker = `[USER_WORKLOAD:${JSON.stringify(workloadData)}]`;

  return JSON.stringify({
    memberCount: workloadData.length,
    workload: workloadData,
    _interactiveMarker: userWorkloadMarker,
    _hint: 'Include the _interactiveMarker value in your response to render interactive user workload cards. You can also reference individual users using [USER:id="..." name="..." email="..." activeIssues="..."] format.',
  });
}

async function getWorkspaceStats(workspaceId: string, prisma: any): Promise<string> {
  const [
    totalIssues,
    projectCount,
    memberCount,
    issuesByType,
    issuesByPriority,
    issuesByStatus,
    overdueCount,
    completedThisWeek,
  ] = await Promise.all([
    prisma.issue.count({ where: { workspaceId } }),
    prisma.project.count({ where: { workspaceId, isArchived: { not: true } } }),
    prisma.workspaceMember.count({ where: { workspaceId, status: true } }),
    prisma.issue.groupBy({
      by: ['type'],
      where: { workspaceId },
      _count: true,
    }),
    prisma.issue.groupBy({
      by: ['priority'],
      where: { workspaceId },
      _count: true,
    }),
    prisma.issue.groupBy({
      by: ['statusId'],
      where: { workspaceId },
      _count: true,
    }),
    prisma.issue.count({
      where: {
        workspaceId,
        dueDate: { lt: new Date() },
        projectStatus: { isFinal: false },
      },
    }),
    prisma.issue.count({
      where: {
        workspaceId,
        projectStatus: { isFinal: true },
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  // Get status names for the groupBy results
  const statusIds = issuesByStatus.map((s: any) => s.statusId).filter(Boolean);
  const statuses = await prisma.projectStatus.findMany({
    where: { id: { in: statusIds } },
    select: { id: true, name: true },
  });
  const statusMap = Object.fromEntries(statuses.map((s: any) => [s.id, s.name]));

  return JSON.stringify({
    totalIssues,
    projectCount,
    memberCount,
    overdueCount,
    completedThisWeek,
    byType: Object.fromEntries(issuesByType.map((t: any) => [t.type, t._count])),
    byPriority: Object.fromEntries(issuesByPriority.map((p: any) => [p.priority || 'none', p._count])),
    byStatus: Object.fromEntries(
      issuesByStatus.map((s: any) => [statusMap[s.statusId] || 'Unknown', s._count])
    ),
  });
}

async function getProjectInfo(
  input: GetProjectInfoInput,
  workspaceId: string,
  prisma: any
): Promise<string> {
  const where: any = { workspaceId };

  if (input.projectId) {
    where.id = input.projectId;
  } else if (input.projectName) {
    where.name = { contains: input.projectName, mode: 'insensitive' };
  } else {
    return JSON.stringify({ error: 'Project ID or name is required' });
  }

  const project = await prisma.project.findFirst({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      issuePrefix: true,
      description: true,
      color: true,
      isArchived: true,
      createdAt: true,
      _count: { select: { issues: true } },
      statuses: { select: { name: true, color: true, order: true } },
    },
  });

  if (!project) {
    return JSON.stringify({ error: 'Project not found' });
  }

  // Get issue breakdown by status
  const issuesByStatus = await prisma.issue.groupBy({
    by: ['statusId'],
    where: { projectId: project.id },
    _count: true,
  });

  const statusIds = issuesByStatus.map((s: any) => s.statusId).filter(Boolean);
  const statuses = await prisma.projectStatus.findMany({
    where: { id: { in: statusIds } },
    select: { id: true, name: true },
  });
  const statusMap = Object.fromEntries(statuses.map((s: any) => [s.id, s.name]));

  // Get recent issues
  const recentIssues = await prisma.issue.findMany({
    where: { projectId: project.id },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      issueKey: true,
      title: true,
      priority: true,
      projectStatus: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });

  return JSON.stringify({
    name: project.name,
    prefix: project.issuePrefix,
    description: project.description,
    totalIssues: project._count.issues,
    statuses: project.statuses.map((s: any) => s.name),
    byStatus: Object.fromEntries(
      issuesByStatus.map((s: any) => [statusMap[s.statusId] || 'Unknown', s._count])
    ),
    recentIssues: recentIssues.map((i: any) => ({
      key: i.issueKey,
      title: i.title,
      status: i.projectStatus?.name,
      assignee: i.assignee?.name,
      priority: i.priority,
    })),
  });
}

async function searchUsers(
  input: SearchUsersInput,
  workspaceId: string,
  prisma: any
): Promise<string> {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: true,
      user: {
        OR: [
          { name: { contains: input.query, mode: 'insensitive' } },
          { email: { contains: input.query, mode: 'insensitive' } },
        ],
      },
    },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Get workload for each user
  const usersWithWorkload = await Promise.all(
    members.map(async (m: any) => {
      const activeIssues = await prisma.issue.count({
        where: {
          workspaceId,
          assigneeId: m.user.id,
          projectStatus: { isFinal: false },
        },
      });

      const overdueIssues = await prisma.issue.count({
        where: {
          workspaceId,
          assigneeId: m.user.id,
          dueDate: { lt: new Date() },
          projectStatus: { isFinal: false },
        },
      });

      return {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        activeIssues,
        overdueIssues,
      };
    })
  );

  return JSON.stringify({
    count: usersWithWorkload.length,
    users: usersWithWorkload,
  });
}

async function getIssueDetails(
  input: GetIssueDetailsInput,
  workspaceId: string,
  prisma: any
): Promise<string> {
  const issue = await prisma.issue.findFirst({
    where: {
      workspaceId,
      issueKey: { equals: input.issueKey, mode: 'insensitive' },
    },
    select: {
      id: true,
      issueKey: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      dueDate: true,
      startDate: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { name: true, issuePrefix: true } },
      projectStatus: { select: { name: true, color: true } },
      assignee: { select: { name: true, email: true } },
      reporter: { select: { name: true } },
      labels: { select: { name: true, color: true } },
      parent: { select: { issueKey: true, title: true } },
      children: {
        select: { issueKey: true, title: true, projectStatus: { select: { name: true } } },
        take: 10,
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          body: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });

  if (!issue) {
    return JSON.stringify({ error: `Issue ${input.issueKey} not found` });
  }

  // Get recent activity
  const activity = await prisma.issueActivity.findMany({
    where: { itemId: issue.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      action: true,
      fieldName: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return JSON.stringify({
    key: issue.issueKey,
    title: issue.title,
    description: issue.description,
    type: issue.type,
    status: issue.projectStatus?.name,
    priority: issue.priority,
    project: issue.project?.name,
    assignee: issue.assignee?.name || 'Unassigned',
    reporter: issue.reporter?.name,
    dueDate: issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : null,
    startDate: issue.startDate ? new Date(issue.startDate).toLocaleDateString() : null,
    labels: issue.labels.map((l: any) => l.name),
    parent: issue.parent ? { key: issue.parent.issueKey, title: issue.parent.title } : null,
    subtasks: issue.children.map((c: any) => ({
      key: c.issueKey,
      title: c.title,
      status: c.projectStatus?.name,
    })),
    recentComments: issue.comments.map((c: any) => ({
      author: c.author?.name,
      body: c.body?.substring(0, 200),
      date: new Date(c.createdAt).toLocaleDateString(),
    })),
    recentActivity: activity.map((a: any) => ({
      action: a.action,
      field: a.fieldName,
      from: a.oldValue,
      to: a.newValue,
      by: a.user?.name,
      date: new Date(a.createdAt).toLocaleDateString(),
    })),
  });
}

async function getRecentActivity(
  input: { limit?: number; userId?: string; userName?: string },
  workspaceId: string,
  prisma: any
): Promise<string> {
  const limit = Math.min(input.limit || 20, 50);
  const where: any = { workspaceId };

  if (input.userId) {
    where.userId = input.userId;
  } else if (input.userName) {
    where.user = { name: { contains: input.userName, mode: 'insensitive' } };
  }

  const activities = await prisma.issueActivity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      action: true,
      fieldName: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      itemId: true,
      user: { select: { name: true } },
    },
  });

  // Fetch issue details for the activities
  const issueIds = [...new Set(activities.map((a: any) => a.itemId))];
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true, issueKey: true, title: true },
  });
  const issueMap = new Map(issues.map((i: any) => [i.id, i]));

  const formatted = activities.map((a: any) => {
    const issue = issueMap.get(a.itemId);
    return {
      action: a.action,
      field: a.fieldName,
      from: a.oldValue,
      to: a.newValue,
      by: a.user?.name,
      issue: issue ? { key: issue.issueKey, title: issue.title } : null,
      date: new Date(a.createdAt).toLocaleString(),
    };
  });

  return JSON.stringify({
    count: formatted.length,
    activities: formatted,
  });
}

async function buildView(
  input: BuildViewInput,
  workspaceId: string,
  prisma: any,
  context: { workspaceSlug?: string; userId?: string }
): Promise<string> {
  const filters: Record<string, any> = {};

  // Get workspace slug if not provided
  let workspaceSlug = context.workspaceSlug;
  if (!workspaceSlug) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { slug: true },
    });
    workspaceSlug = workspace?.slug || workspaceId;
  }

  // Resolve project names to IDs
  let projectIds = input.projectIds || [];
  if (input.projectNames && input.projectNames.length > 0) {
    const projects = await prisma.project.findMany({
      where: {
        workspaceId,
        name: { in: input.projectNames, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    projectIds = [...projectIds, ...projects.map((p: any) => p.id)];
  }

  // Build filters object
  if (input.filters) {
    // Type filter
    if (input.filters.type && input.filters.type.length > 0) {
      filters.type = input.filters.type;
    }

    // Status filter
    if (input.filters.status && input.filters.status.length > 0) {
      filters.status = input.filters.status;
    }

    // Priority filter
    if (input.filters.priority && input.filters.priority.length > 0) {
      filters.priority = input.filters.priority;
    }

    // Assignee filter - resolve names to IDs
    const assigneeIds: string[] = [];

    if (input.filters.assignee && input.filters.assignee.length > 0) {
      for (const assignee of input.filters.assignee) {
        if (assignee === 'current_user' && context.userId) {
          assigneeIds.push(context.userId);
        } else if (assignee === 'unassigned') {
          assigneeIds.push('unassigned');
        } else {
          assigneeIds.push(assignee);
        }
      }
    }

    if (input.filters.assigneeNames && input.filters.assigneeNames.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          workspaces: { some: { workspaceId } },
          name: { in: input.filters.assigneeNames, mode: 'insensitive' },
        },
        select: { id: true, name: true },
      });
      assigneeIds.push(...users.map((u: any) => u.id));
    }

    if (assigneeIds.length > 0) {
      filters.assignee = assigneeIds;
    }

    // Unassigned filter
    if (input.filters.isUnassigned) {
      filters.assignee = ['unassigned'];
    }

    // Overdue filter
    if (input.filters.isOverdue) {
      filters.isOverdue = ['true'];
    }

    // Labels filter
    if (input.filters.labels && input.filters.labels.length > 0) {
      // Check if they're IDs or names
      const labels = await prisma.label.findMany({
        where: {
          workspaceId,
          OR: [
            { id: { in: input.filters.labels } },
            { name: { in: input.filters.labels, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      filters.labels = labels.map((l: any) => l.id);
    }

    // Date filters
    if (input.filters.dueDate && input.filters.dueDate.length > 0) {
      filters.dueDate = input.filters.dueDate;
    }

    if (input.filters.updatedAt && input.filters.updatedAt.length > 0) {
      filters.updatedAt = input.filters.updatedAt;
    }

    if (input.filters.createdAt && input.filters.createdAt.length > 0) {
      filters.createdAt = input.filters.createdAt;
    }
  }

  // Build URL params
  const params = new URLSearchParams();
  params.set('name', input.name);

  if (input.displayType) {
    params.set('displayType', input.displayType);
  } else {
    // Auto-select display type based on context
    if (input.grouping || filters.status) {
      params.set('displayType', 'KANBAN');
    } else {
      params.set('displayType', 'LIST');
    }
  }

  if (input.grouping) {
    params.set('grouping', input.grouping);
  } else if (params.get('displayType') === 'KANBAN') {
    params.set('grouping', 'status');
  }

  if (Object.keys(filters).length > 0) {
    // Don't double-encode - URLSearchParams.toString() handles encoding
    params.set('filters', JSON.stringify(filters));
  }

  if (projectIds.length > 0) {
    params.set('projects', JSON.stringify(projectIds));
  }

  // Build the view URL - use relative path from workspace root
  const viewUrl = `/views/dynamic?${params.toString()}`;

  // Count matching issues for the response
  const countQuery: any = {
    where: { workspaceId },
  };

  if (projectIds.length > 0) {
    countQuery.where.projectId = { in: projectIds };
  }

  if (filters.type) {
    countQuery.where.type = { in: filters.type };
  }

  if (filters.priority) {
    countQuery.where.priority = { in: filters.priority };
  }

  if (filters.assignee) {
    const assigneeFilters = filters.assignee.filter((a: string) => a !== 'unassigned');
    const hasUnassigned = filters.assignee.includes('unassigned');

    if (hasUnassigned && assigneeFilters.length > 0) {
      countQuery.where.OR = [
        { assigneeId: { in: assigneeFilters } },
        { assigneeId: null },
      ];
    } else if (hasUnassigned) {
      countQuery.where.assigneeId = null;
    } else if (assigneeFilters.length > 0) {
      countQuery.where.assigneeId = { in: assigneeFilters };
    }
  }

  if (filters.isOverdue) {
    countQuery.where.dueDate = { lt: new Date() };
    countQuery.where.projectStatus = { isFinal: false };
  }

  const issueCount = await prisma.issue.count(countQuery);

  // Build filter summary for response
  const filterSummary: string[] = [];
  if (filters.type) filterSummary.push(`type: ${filters.type.join(', ')}`);
  if (filters.status) filterSummary.push(`status: ${filters.status.join(', ')}`);
  if (filters.priority) filterSummary.push(`priority: ${filters.priority.join(', ')}`);
  if (filters.assignee) filterSummary.push(`assignees: ${filters.assignee.length}`);
  if (filters.isOverdue) filterSummary.push('overdue only');

  // Build interactive marker for the dynamic view card
  const viewData = {
    name: input.name,
    displayType: params.get('displayType'),
    grouping: params.get('grouping') || 'none',
    issueCount,
    filterSummary: filterSummary.join(', ') || 'no filters',
    viewUrl,
  };
  const dynamicViewMarker = `[DYNAMIC_VIEW:${JSON.stringify(viewData)}]`;

  return JSON.stringify({
    success: true,
    viewName: input.name,
    displayType: params.get('displayType'),
    grouping: params.get('grouping') || 'none',
    issueCount,
    filterSummary: filterSummary.join(', ') || 'no filters',
    viewUrl,
    _interactiveMarker: dynamicViewMarker,
    _hint: `Include the _interactiveMarker in your response to show a clickable view card. The card has an "Open View" button that will navigate the user. Tell the user you've prepared the "${input.name}" view with ${issueCount} issues - they can click "Open View" to see it.`,
  });
}

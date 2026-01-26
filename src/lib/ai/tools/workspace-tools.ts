/**
 * AI Tools for Workspace Data Access
 *
 * These tools allow AI agents to query real data from the database.
 */

import { prisma } from '@/lib/prisma';
import type { AIToolDefinition } from '../core/types';

// ============================================================================
// Tool Definitions (for AI function calling)
// ============================================================================

export const WORKSPACE_TOOLS: AIToolDefinition[] = [
  {
    name: 'get_my_tasks',
    description: 'Get tasks/issues assigned to the current user. Use this when user asks about their tasks, assignments, or work items.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default 10)',
        },
        status: {
          type: 'string',
          description: 'Filter by status: all, open, in_progress, done, backlog',
        },
        projectId: {
          type: 'string',
          description: 'Optional project ID to filter tasks',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_issues',
    description: 'Search for issues/tasks by keyword, title, or description.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find issues',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 10)',
        },
        projectId: {
          type: 'string',
          description: 'Optional project ID to filter search',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_project_issues',
    description: 'Get issues for a specific project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 20)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_workspace_stats',
    description: 'Get statistics for the workspace including issue counts, project counts, etc.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum projects to return',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_activity',
    description: 'Get recent activity in the workspace (recently updated issues, comments, etc.)',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent items (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new issue/task in a project.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Issue title',
        },
        description: {
          type: 'string',
          description: 'Issue description (optional)',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to create the issue in',
        },
        priority: {
          type: 'string',
          description: 'Priority level: urgent, high, medium, low, none',
        },
      },
      required: ['title', 'projectId'],
    },
  },
];

// ============================================================================
// Tool Executors
// ============================================================================

export async function executeWorkspaceTool(
  toolName: string,
  params: Record<string, unknown>,
  context: {
    workspaceId: string;
    userId: string;
    projectId?: string;
  }
): Promise<unknown> {
  try {
    switch (toolName) {
      case 'get_my_tasks':
        return await getMyTasks(context.userId, context.workspaceId, params);

      case 'search_issues':
        return await searchIssues(context.workspaceId, params);

      case 'get_project_issues':
        return await getProjectIssues(context.workspaceId, params);

      case 'get_workspace_stats':
        return await getWorkspaceStats(context.workspaceId);

      case 'list_projects':
        return await listProjects(context.workspaceId, params);

      case 'get_recent_activity':
        return await getRecentActivity(context.workspaceId, params);

      case 'create_issue':
        return await createIssue(context.workspaceId, context.userId, params);

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return {
      error: error instanceof Error ? error.message : 'Tool execution failed',
      toolName,
    };
  }
}

// ============================================================================
// Tool Implementations
// ============================================================================

async function getMyTasks(
  userId: string,
  workspaceId: string,
  params: Record<string, unknown>
) {
  const limit = (params.limit as number) || 10;

  const issues = await prisma.issue.findMany({
    where: {
      assigneeId: userId,
      workspaceId: workspaceId,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      issueKey: true,
      title: true,
      statusValue: true,
      priority: true,
      type: true,
      createdAt: true,
      updatedAt: true,
      dueDate: true,
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    tasks: issues.map((issue) => ({
      id: issue.id,
      key: issue.issueKey || issue.id.slice(0, 8),
      title: issue.title,
      status: issue.statusValue || 'unknown',
      priority: issue.priority,
      type: issue.type,
      project: issue.project?.name || 'Unknown',
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      dueDate: issue.dueDate,
    })),
    count: issues.length,
    message: issues.length === 0
      ? 'No tasks assigned to you.'
      : `Found ${issues.length} task(s) assigned to you.`,
  };
}

async function searchIssues(
  workspaceId: string,
  params: Record<string, unknown>
) {
  const query = (params.query as string) || '';
  const limit = (params.limit as number) || 10;

  const issues = await prisma.issue.findMany({
    where: {
      workspaceId: workspaceId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { issueKey: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      issueKey: true,
      title: true,
      statusValue: true,
      priority: true,
      type: true,
      project: {
        select: {
          name: true,
        },
      },
      assignee: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    results: issues.map((issue) => ({
      id: issue.id,
      key: issue.issueKey || issue.id.slice(0, 8),
      title: issue.title,
      status: issue.statusValue || 'unknown',
      priority: issue.priority,
      type: issue.type,
      project: issue.project?.name || 'Unknown',
      assignee: issue.assignee?.name || 'Unassigned',
    })),
    count: issues.length,
    query,
  };
}

async function getProjectIssues(
  workspaceId: string,
  params: Record<string, unknown>
) {
  const projectId = params.projectId as string;
  const limit = (params.limit as number) || 20;

  if (!projectId) {
    return { error: 'Project ID is required' };
  }

  const issues = await prisma.issue.findMany({
    where: {
      projectId,
      workspaceId,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      issueKey: true,
      title: true,
      statusValue: true,
      priority: true,
      type: true,
      assignee: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    issues: issues.map((issue) => ({
      id: issue.id,
      key: issue.issueKey || issue.id.slice(0, 8),
      title: issue.title,
      status: issue.statusValue || 'unknown',
      priority: issue.priority,
      type: issue.type,
      assignee: issue.assignee?.name || 'Unassigned',
    })),
    count: issues.length,
  };
}

async function getWorkspaceStats(workspaceId: string) {
  const [totalIssues, totalProjects, recentlyCreated] = await Promise.all([
    prisma.issue.count({
      where: { workspaceId },
    }),
    prisma.project.count({
      where: { workspaceId },
    }),
    prisma.issue.count({
      where: {
        workspaceId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    totalIssues,
    totalProjects,
    issuesCreatedThisWeek: recentlyCreated,
  };
}

async function listProjects(
  workspaceId: string,
  params: Record<string, unknown>
) {
  const limit = (params.limit as number) || 50;

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      identifier: true,
      description: true,
      _count: {
        select: {
          issues: true,
        },
      },
    },
  });

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      identifier: p.identifier,
      description: p.description,
      issueCount: p._count.issues,
    })),
    count: projects.length,
  };
}

async function getRecentActivity(
  workspaceId: string,
  params: Record<string, unknown>
) {
  const limit = (params.limit as number) || 10;

  const recentIssues = await prisma.issue.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      issueKey: true,
      title: true,
      statusValue: true,
      updatedAt: true,
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  return {
    recentIssues: recentIssues.map((i) => ({
      id: i.id,
      key: i.issueKey || i.id.slice(0, 8),
      title: i.title,
      status: i.statusValue || 'unknown',
      project: i.project?.name || 'Unknown',
      updatedAt: i.updatedAt,
    })),
  };
}

async function createIssue(
  workspaceId: string,
  userId: string,
  params: Record<string, unknown>
) {
  const title = params.title as string;
  const description = params.description as string;
  const projectId = params.projectId as string;
  const priority = (params.priority as string) || 'medium';

  if (!title || !projectId) {
    return { error: 'Title and projectId are required' };
  }

  // Get project to generate issue key
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
    },
    select: {
      id: true,
      name: true,
      _count: { select: { issues: true } }
    },
  });

  if (!project) {
    return { error: 'Project not found in this workspace' };
  }

  const issueNumber = project._count.issues + 1;
  // Generate a simple issue key based on project name
  const projectPrefix = project.name.substring(0, 3).toUpperCase();
  const issueKey = `${projectPrefix}-${issueNumber}`;

  const issue = await prisma.issue.create({
    data: {
      title,
      description,
      issueKey,
      projectId,
      workspaceId,
      reporterId: userId,
      statusValue: 'open',
      priority,
      type: 'TASK',
    },
    select: {
      id: true,
      issueKey: true,
      title: true,
      statusValue: true,
      priority: true,
      type: true,
    },
  });

  return {
    success: true,
    issue: {
      id: issue.id,
      key: issue.issueKey,
      title: issue.title,
      status: issue.statusValue,
      priority: issue.priority,
      type: issue.type,
    },
    message: `Created issue ${issue.issueKey}: ${issue.title}`,
  };
}

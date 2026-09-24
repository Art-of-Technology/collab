import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from 'zod';
import { IssueType } from '@prisma/client';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';
import { updateIssue } from '@/lib/issue-mutation';

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = z.object({
      action: z.object({ type: z.string(), params: z.record(z.unknown()) }),
      context: z.object({ workspace: z.object({ id: z.string().min(1) }) }),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Action and context are required" },
        { status: 400 }
      );
    }

    const { action, context } = parsed.data;

    // Verify workspace access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: context.workspace.id,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id, status: true } } },
        ]
      },
      select: { id: true, slug: true }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const workspaceBase = `/${workspace.slug || workspace.id}`;

    // Execute action based on type
    switch (action.type) {
      case 'navigate': {
        const params = action.params as Record<string, string>;
        let navigateTo: string;

        if (params.issueKey) {
          navigateTo = `${workspaceBase}/issues/${params.issueKey}`;
        } else if (params.projectSlug || params.projectId) {
          navigateTo = `${workspaceBase}/projects/${params.projectSlug || params.projectId}`;
        } else if (params.viewSlug || params.viewId) {
          navigateTo = `${workspaceBase}/views/${params.viewSlug || params.viewId}`;
        } else {
          const pathMap: Record<string, string> = {
            'dashboard': '/dashboard',
            'issues': '/views/all-issues',
            'my-issues': '/views/my-issues',
            'overdue': '/views/overdue',
            'projects': '/projects',
            'views': '/views',
            'settings': '/settings',
          };
          navigateTo = workspaceBase + (pathMap[params.path] || '/dashboard');
        }

        return NextResponse.json({
          success: true,
          navigateTo,
          message: 'Navigating...',
        });
      }

      case 'search': {
        const params = action.params as Record<string, any>;
        const where: any = { workspaceId: workspace.id };

        if (params.query) {
          where.OR = [
            { title: { contains: params.query, mode: 'insensitive' } },
            { description: { contains: params.query, mode: 'insensitive' } },
            { issueKey: { contains: params.query.toUpperCase(), mode: 'insensitive' } },
          ];
        }
        if (params.status) {
          where.status = Array.isArray(params.status) ? { in: params.status } : params.status;
        }
        if (params.priority) {
          where.priority = Array.isArray(params.priority) ? { in: params.priority } : params.priority;
        }
        if (params.type) {
          where.type = Array.isArray(params.type) ? { in: params.type } : params.type;
        }
        if (params.assigneeId) {
          where.assigneeId = params.assigneeId;
        }
        if (params.projectId) {
          where.projectId = params.projectId;
        }
        if (params.isOverdue) {
          where.dueDate = { lt: new Date() };
        }

        const issues = await prisma.issue.findMany({
          where,
          take: 20,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            issueKey: true,
            status: true,
            priority: true,
            type: true,
            dueDate: true,
            assignee: { select: { id: true, name: true, image: true } },
            project: { select: { id: true, name: true, slug: true } },
          }
        });

        return NextResponse.json({
          success: true,
          data: {
            issues,
            count: issues.length,
          },
          message: `Found ${issues.length} issue${issues.length === 1 ? '' : 's'}`,
        });
      }

      case 'create_issue': {
        const parsedParams = z.object({
          title: z.string().trim().min(1).max(200),
          description: z.string().max(100000).optional(),
          type: z.nativeEnum(IssueType).optional(),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          projectId: z.string().min(1).optional(),
          assigneeId: z.string().min(1).optional(),
        }).strict().safeParse(action.params);
        if (!parsedParams.success) {
          return NextResponse.json({ error: 'Invalid issue creation' }, { status: 400 });
        }
        if (!(await checkUserPermission(currentUser.id, workspace.id, Permission.CREATE_TASK)).hasPermission) {
          return NextResponse.json({ error: 'No permission to create issues' }, { status: 403 });
        }
        const params = parsedParams.data;
        if (params.assigneeId && !await userHasWorkspaceAccess(params.assigneeId, workspace.id)) {
          return NextResponse.json({ error: 'Invalid issue participant' }, { status: 400 });
        }

        // Get or validate project
        let projectId = params.projectId;
        if (!projectId) {
          // Get first project in workspace
          const defaultProject = await prisma.project.findFirst({
            where: { workspaceId: workspace.id },
            select: { id: true, issuePrefix: true },
          });
          if (!defaultProject) {
            return NextResponse.json({
              success: false,
              error: 'No project available. Please create a project first.',
            }, { status: 400 });
          }
          projectId = defaultProject.id;
        }

        // Get project details for issue key generation
        const project = await prisma.project.findFirst({
          where: { id: projectId, workspaceId: workspace.id },
          select: { id: true, issuePrefix: true, _count: { select: { issues: true } } },
        });

        if (!project) {
          return NextResponse.json({
            success: false,
            error: 'Project not found',
          }, { status: 404 });
        }

        // Create the issue
        const issueNumber = project._count.issues + 1;
        const issueKey = `${project.issuePrefix}-${issueNumber}`;

        const issue = await prisma.issue.create({
          data: {
            title: params.title,
            description: params.description || '',
            type: params.type || 'TASK',
            priority: params.priority || 'medium',
            status: 'backlog',
            issueKey,
            projectId,
            workspaceId: workspace.id,
            reporterId: currentUser.id,
            assigneeId: params.assigneeId,
          },
          select: {
            id: true,
            title: true,
            issueKey: true,
            status: true,
            priority: true,
          },
        });

        return NextResponse.json({
          success: true,
          data: issue,
          navigateTo: `${workspaceBase}/issues/${issue.issueKey}`,
          message: `Created issue ${issue.issueKey}: ${issue.title}`,
        });
      }

      case 'update_issue': {
        const { issueId, ...fields } = action.params;
        if (typeof issueId !== 'string' || !issueId) {
          return NextResponse.json({ error: 'Issue ID is required' }, { status: 400 });
        }
        const result = await updateIssue(currentUser.id, issueId, fields, workspace.id);
        if ('error' in result) {
          return NextResponse.json({ error: result.error }, { status: result.status });
        }
        const { id, title, issueKey, status, priority } = result.issue;
        const issue = { id, title, issueKey, status, priority };

        return NextResponse.json({
          success: true,
          data: issue,
          message: `Updated issue ${issue.issueKey}`,
        });
      }

      case 'summarize':
      case 'analyze': {
        // Redirect to the summarize endpoint
        return NextResponse.json({
          success: true,
          redirect: '/api/ai/summarize',
          message: 'Use the summarize endpoint for this action',
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action type: ${action.type}`,
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in AI action API:', error);
    return NextResponse.json(
      { error: "Failed to execute action" },
      { status: 500 }
    );
  }
}

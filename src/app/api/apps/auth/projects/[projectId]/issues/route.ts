/**
 * Third-Party App API: Project Issues Endpoint
 * GET /api/apps/auth/projects/:projectId/issues - Get issues for a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/projects/:projectId/issues
 * Get filtered issues for a project
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);

      // Filters
      const type = searchParams.get('type');
      const status = searchParams.get('status');
      const priority = searchParams.get('priority');
      const assigneeId = searchParams.get('assigneeId');
      const search = searchParams.get('search');
      const sortBy = searchParams.get('sortBy') || 'updatedAt';
      const sortOrder = searchParams.get('sortOrder') || 'desc';
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      // Verify project exists and belongs to workspace
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Build where clause
      const where: any = {
        projectId,
        workspaceId: context.workspace.id,
      };

      if (type && ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(type)) {
        where.type = type;
      }

      if (status) {
        where.OR = [
          { status },
          { statusValue: status },
        ];
      }

      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        where.priority = priority;
      }

      if (assigneeId) {
        where.assigneeId = assigneeId;
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { issueKey: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      // Build orderBy
      const validSortFields = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title'];
      const orderByField = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
      const orderBy = { [orderByField]: sortOrder === 'asc' ? 'asc' : 'desc' };

      const skip = (page - 1) * limit;

      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            reporter: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            labels: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
            projectStatus: {
              select: {
                id: true,
                name: true,
                displayName: true,
                color: true,
              },
            },
            _count: {
              select: {
                comments: true,
                children: true,
              },
            },
          },
        }),
        prisma.issue.count({ where }),
      ]);

      return NextResponse.json({
        projectId,
        projectName: project.name,
        issues: issues.map(issue => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description,
          type: issue.type,
          status: issue.status || issue.statusValue,
          projectStatus: issue.projectStatus,
          priority: issue.priority,
          storyPoints: issue.storyPoints,
          dueDate: issue.dueDate,
          progress: issue.progress,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          assignee: issue.assignee,
          reporter: issue.reporter,
          labels: issue.labels,
          stats: {
            commentCount: issue._count.comments,
            childCount: issue._count.children,
          },
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error fetching project issues:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);

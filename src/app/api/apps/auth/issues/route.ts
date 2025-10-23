/**
 * Third-Party App API: Issues Endpoints
 * GET /api/apps/auth/issues - List issues with filtering by projectId, assigneeId, status, type, priority, search
 * POST /api/apps/auth/issues - Create new issue with projectId (required), title, description, type, priority, etc.
 * 
 * Required scopes:
 * - issues:read for GET
 * - issues:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating new issues
const CreateIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK']).default('TASK'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  projectId: z.string().cuid(), // Required field in schema
  assigneeId: z.string().cuid().optional(),
  parentId: z.string().cuid().optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  storyPoints: z.number().int().positive().optional(),
  color: z.string().optional(),
});

/**
 * GET /api/apps/auth/issues
 * List issues with filtering and pagination
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const projectId = searchParams.get('projectId');
      const assigneeId = searchParams.get('assigneeId');
      const status = searchParams.get('status');
      const type = searchParams.get('type');
      const priority = searchParams.get('priority');
      const search = searchParams.get('search');

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      if (projectId) {
        where.projectId = projectId;
      }

      if (assigneeId) {
        where.assigneeId = assigneeId;
      }

      if (status) {
        // Handle both legacy status field and new statusValue field
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { status: status },
            { statusValue: status }
          ]
        });
      }

      if (type && ['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK'].includes(type)) {
        where.type = type;
      }

      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        where.priority = priority;
      }

      if (search) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { issueKey: { contains: search, mode: 'insensitive' } }
          ]
        });
      }

      // Get issues with related data
      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
                issuePrefix: true
              }
            },
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            reporter: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            comments: {
              select: {
                id: true
              }
            }
          }
        }),
        prisma.issue.count({ where })
      ]);

      const response = {
        issues: issues.map(issue => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description,
          type: issue.type,
          status: issue.status || issue.statusValue, // Handle both legacy and new status fields
          statusId: issue.statusId,
          priority: issue.priority,
          dueDate: issue.dueDate,
          startDate: issue.startDate,
          storyPoints: issue.storyPoints,
          parentId: issue.parentId,
          position: issue.position,
          progress: issue.progress,
          color: issue.color,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          project: issue.project,
          assignee: issue.assignee,
          reporter: issue.reporter,
          stats: {
            commentCount: issue.comments.length
          }
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching issues:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * POST /api/apps/auth/issues
 * Create a new issue
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const issueData = CreateIssueSchema.parse(body);

      // Validate project exists and user has access (projectId is required)
      const project = await prisma.project.findFirst({
        where: {
          id: issueData.projectId,
          workspaceId: context.workspace.id
        }
      });

      if (!project) {
        return NextResponse.json(
          { error: 'project_not_found', error_description: 'Project not found or access denied' },
          { status: 404 }
        );
      }

      // Validate assignee exists and is a workspace member
      if (issueData.assigneeId) {
        const assignee = await prisma.workspaceMember.findFirst({
          where: {
            userId: issueData.assigneeId,
            workspaceId: context.workspace.id
          }
        });

        if (!assignee) {
          return NextResponse.json(
            { error: 'assignee_not_found', error_description: 'Assignee not found or not a workspace member' },
            { status: 404 }
          );
        }
      }

      // Generate issue key using the project we already fetched
      const keyPrefix = project.issuePrefix;
      const issueCount = await prisma.issue.count({
        where: {
          projectId: issueData.projectId
        }
      });
      const issueKey = `${keyPrefix}-${issueCount + 1}`;

      // Validate parent issue if provided
      if (issueData.parentId) {
        const parentIssue = await prisma.issue.findFirst({
          where: {
            id: issueData.parentId,
            workspaceId: context.workspace.id
          }
        });

        if (!parentIssue) {
          return NextResponse.json(
            { error: 'parent_issue_not_found', error_description: 'Parent issue not found' },
            { status: 404 }
          );
        }
      }

      // Create the issue
      const newIssue = await prisma.issue.create({
        data: {
          title: issueData.title,
          description: issueData.description,
          type: issueData.type,
          priority: issueData.priority,
          projectId: issueData.projectId,
          assigneeId: issueData.assigneeId,
          parentId: issueData.parentId,
          workspaceId: context.workspace.id,
          reporterId: context.user.id,
          issueKey: issueKey,
          dueDate: issueData.dueDate ? new Date(issueData.dueDate) : null,
          startDate: issueData.startDate ? new Date(issueData.startDate) : null,
          storyPoints: issueData.storyPoints,
          color: issueData.color,
          status: 'open' // Use default status for now
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true
            }
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          parent: {
            select: {
              id: true,
              title: true,
              issueKey: true,
              type: true
            }
          },
          labels: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        }
      });

      return NextResponse.json(newIssue, { status: 201 });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'validation_error', 
            error_description: 'Invalid request data',
            details: error.errors
          },
          { status: 400 }
        );
      }

      console.error('Error creating issue:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['issues:write'] }
);

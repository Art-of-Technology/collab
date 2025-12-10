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
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

// Schema for creating new issues
const CreateIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK']).default('TASK'),
  status: z.string().optional(), // Status name or displayName - will resolve to ProjectStatus
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  projectId: z.string().cuid(), // Required field in schema
  assigneeId: z.string().cuid().optional(),
  parentId: z.string().cuid().optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  storyPoints: z.number().int().positive().optional(),
  color: z.string().optional(),
  labels: z.array(z.string()).optional(), // Array of label IDs
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
        issues: issues.map((issue: any) => ({
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

      // Create the issue with proper issue key generation using transaction
      // to avoid race conditions with concurrent requests
      const newIssue = await prisma.$transaction(async (tx: typeof prisma) => {
        // Get project with current nextIssueNumbers counter
        const projectWithCounter = await tx.project.findUnique({
          where: { id: issueData.projectId },
          select: { nextIssueNumbers: true, issuePrefix: true }
        });

        if (!projectWithCounter) {
          throw new Error('Project not found');
        }

        // Get next issue number from counter (or fallback to count-based)
        const counters = (projectWithCounter.nextIssueNumbers as Record<string, number>) || {};
        let nextNum = counters.TASK || 1;
        const keyPrefix = projectWithCounter.issuePrefix;

        // Try to find a unique issue key (handle any gaps or existing keys)
        let issueKey: string;
        let attempts = 0;
        const maxAttempts = 100;

        do {
          issueKey = `${keyPrefix}-${nextNum}`;

          const existingIssue = await tx.issue.findFirst({
            where: {
              projectId: issueData.projectId,
              issueKey
            }
          });

          if (!existingIssue) break;
          nextNum++;
          attempts++;
        } while (attempts < maxAttempts);

        if (attempts >= maxAttempts) {
          throw new Error('Could not generate unique issue key');
        }

        // Find the ProjectStatus for the given status and project
        let statusId: string | null = null;
        let resolvedStatusName: string | undefined;

        if (issueData.status) {
          const projectStatus = await tx.projectStatus.findFirst({
            where: {
              projectId: issueData.projectId,
              OR: [
                { name: issueData.status },
                { displayName: issueData.status },
                { id: issueData.status } // Also allow status ID directly
              ]
            }
          });
          if (projectStatus) {
            statusId = projectStatus.id;
            resolvedStatusName = projectStatus.name;
          }
        }

        // If no status provided or not found, get the default status for the project
        if (!statusId) {
          const defaultStatus = await tx.projectStatus.findFirst({
            where: {
              projectId: issueData.projectId,
              isDefault: true
            }
          });
          if (defaultStatus) {
            statusId = defaultStatus.id;
            resolvedStatusName = defaultStatus.name;
          }
        }

        // Create the issue
        const created = await tx.issue.create({
          data: {
            title: issueData.title,
            description: issueData.description,
            type: issueData.type,
            statusId: statusId,
            statusValue: resolvedStatusName,
            status: resolvedStatusName,
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
            labels: issueData.labels?.length
              ? { connect: issueData.labels.map((id: string) => ({ id })) }
              : undefined,
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
            },
            projectStatus: {
              select: {
                id: true,
                name: true,
                displayName: true,
                color: true,
                order: true,
                isDefault: true
              }
            }
          }
        });

        // Update the counter for next issue
        const updatedCounters = { ...counters, TASK: nextNum + 1 };
        await tx.project.update({
          where: { id: issueData.projectId },
          data: { nextIssueNumbers: updatedCounters }
        });

        // Create IssueAssignee record if issue is assigned to someone
        if (issueData.assigneeId) {
          await tx.issueAssignee.create({
            data: {
              issueId: created.id,
              userId: issueData.assigneeId,
              role: 'ASSIGNEE',
              status: 'APPROVED',
              assignedAt: new Date(),
              approvedAt: new Date(),
              approvedBy: context.user.id
            }
          });
        }

        // If this is a sub-issue (has a parent), create the PARENT relation
        if (issueData.parentId) {
          await tx.issueRelation.create({
            data: {
              sourceIssueId: created.id,
              targetIssueId: issueData.parentId,
              relationType: 'PARENT',
            }
          });
        }

        return created;
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
    }
  },
  { requiredScopes: ['issues:write'] }
);

import { InvalidMilestone, validateMilestone } from '@/lib/issue-milestones';
import { allocateIssueKey } from '@/lib/issue-key-allocation';
import { enqueueLabelHandoff, InvalidIssueLabels } from '@/lib/agent-label-triggers';
import { ForgeProjectWriteError, assertLegacyIssueWriteAllowed, assertLegacyProjectWriteAllowed } from '@/lib/forge/legacy-write-guard';
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
import { DEFAULT_STATUS_ORDER } from '@/constants/project-statuses';
import { isDone, legacyStatusLabel, resolveLegacyStatus } from '@/lib/project-overview';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { emitIssueCreated } from '@/lib/event-bus';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';
import { createRefusal, issueShape } from '@/lib/issue-template-enforcement';
import { assertAssignable, HandoffError } from '@/lib/issue-assignee';
import { assertTokenMayAssign, assignCapReached, lockSeatHandoffCap, recordSeatHandoff, seatWriteGuard } from '@/lib/agent-seats';

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
  milestoneId: z.string().cuid().nullable().optional(),
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
      const milestoneId = searchParams.get('milestoneId');
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

      if (milestoneId) where.milestoneId = milestoneId;

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
            },
            projectStatus: { select: { isFinal: true } }
          }
        }),
        prisma.issue.count({ where })
      ]);

      // An issue saved before project statuses has only a label: it is finished where the Overview counts it finished.
      const legacyProjectIds = [...new Set(issues.filter(issue => !issue.statusId && legacyStatusLabel(issue)).map(issue => issue.projectId))];
      const activeStatuses = legacyProjectIds.length ? await prisma.projectStatus.findMany({
        where: { projectId: { in: legacyProjectIds }, project: { workspaceId: context.workspace.id }, isActive: true },
        select: { projectId: true, name: true, displayName: true, isFinal: true },
      }) : [];
      const finished = (issue: typeof issues[number]) => {
        const status = issue.statusId ? issue.projectStatus
          : resolveLegacyStatus(legacyStatusLabel(issue), activeStatuses.filter(status => status.projectId === issue.projectId));
        return status?.isFinal ?? isDone({ ...issue, projectStatus: null });
      };

      const response = {
        issues: issues.map((issue: any) => ({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          description: issue.description,
          type: issue.type,
          status: issue.status || issue.statusValue, // Handle both legacy and new status fields
          statusId: issue.statusId,
          // Finished as the project summary and the Overview count it, whatever the stored label says.
          done: finished(issue),
          // A request to a seat, which the summary and the Overview do not count as work.
          request: issue.agentRequestRole !== null,
          priority: issue.priority,
          dueDate: issue.dueDate,
          startDate: issue.startDate,
          milestoneId: issue.milestoneId,
          baselineStartDate: issue.baselineStartDate,
          baselineDueDate: issue.baselineDueDate,
          finishedAt: issue.finishedAt,
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

      await seatWriteGuard(prisma, context, project.id);

      if (issueData.assigneeId) {
        await assertTokenMayAssign(prisma, context, issueData.assigneeId, false);
        await assertAssignable(prisma, { workspaceId: context.workspace.id, projectId: project.id, agentRequestRole: null }, issueData.assigneeId);
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
        await seatWriteGuard(prisma, context, parentIssue.projectId);
      }

      // Create the issue with proper issue key generation using transaction
      // to avoid race conditions with concurrent requests
      await assertLegacyProjectWriteAllowed(project.id);
      if (issueData.parentId) await assertLegacyIssueWriteAllowed(issueData.parentId);

      // Agents are held to the workspace's issue templates. A field counts only when the request
      // states it, so the default priority does not satisfy a template that requires one.
      const { enforced, templates } = await getWorkspaceTemplates(context.workspace.id);
      const refusal = enforced && createRefusal(templates, issueShape({ ...issueData, priority: body.priority === undefined ? undefined : issueData.priority }));
      if (refusal) return NextResponse.json(refusal, { status: 422 });

      // An agent token over its daily cap of issues for seats still files the issue; it waits unassigned for a person.
      let capped = false;
      const newIssue = await prisma.$transaction(async (tx) => {
        await validateMilestone(tx, { projectId: project.id, workspaceId: context.workspace.id }, issueData.milestoneId);
        if (issueData.labels?.length) await lockSeatHandoffCap(tx, context.user.id);
        capped = !!issueData.assigneeId && await assignCapReached(tx, context, issueData.assigneeId);
        const assigneeId = capped ? undefined : issueData.assigneeId;
        const issueKey = await allocateIssueKey(tx, issueData.projectId);

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
            },
            orderBy: DEFAULT_STATUS_ORDER
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
            assigneeId,
            parentId: issueData.parentId,
            milestoneId: issueData.milestoneId,
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

        // Counted before the labels are read: a release request the labels ask for is one more issue for a seat.
        if (assigneeId) await recordSeatHandoff(tx, context, assigneeId, created.id);
        if (issueData.labels?.length) await enqueueLabelHandoff(tx, context.user.id, created, []);

        // Create IssueAssignee record if issue is assigned to someone
        if (assigneeId) {
          await tx.issueAssignee.create({
            data: {
              issueId: created.id,
              userId: assigneeId,
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
      }, issueData.milestoneId ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined);

      // Fire-and-forget Qdrant sync
      emitIssueCreated(
        newIssue,
        {
          userId: context.user.id,
          workspaceId: context.workspace.id,
          workspaceName: context.workspace.name || '',
          workspaceSlug: context.workspace.slug || '',
          source: 'mcp-api',
        },
        { async: true }
      ).catch(() => {});

      return NextResponse.json(capped ? { ...newIssue, warning: 'assign_cap' } : newIssue, { status: 201 });

    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return NextResponse.json({ error: 'issue_conflict', error_description: 'Issue changed; retry creation' }, { status: 409 });
      }
      if (error instanceof InvalidMilestone) return NextResponse.json({ error: 'invalid_milestone', error_description: error.message }, { status: 400 });
      if (error instanceof InvalidIssueLabels) return NextResponse.json({ error: 'invalid_labels' }, { status: 400 });
      if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: 'forge_connected_project', error_description: error.message }, { status: 409 });
      if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
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
  { requiredScopes: ['issues:write'], seatWrites: true }
);

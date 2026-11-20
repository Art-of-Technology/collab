import { assertMilestoneHasNoIssues, InvalidMilestone, validateMilestone } from '@/lib/issue-milestones';
import { changeIssueTrash, IssueTrashError } from '@/lib/issue-trash';
import { issueTrashErrorResponse } from '@/lib/issue-trash-response';
import { ForgeProjectWriteError, assertLegacyIssueWriteAllowed } from '@/lib/forge/legacy-write-guard';
/**
 * Third-Party App API: Single Issue Endpoints
 * GET /api/apps/auth/issues/:issueIdOrKey - Get issue details
 * PATCH /api/apps/auth/issues/:issueIdOrKey - Update issue
 * DELETE /api/apps/auth/issues/:issueIdOrKey - Delete issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { enqueueLabelHandoff, InvalidIssueLabels } from '@/lib/agent-label-triggers';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';
import { emitIssueUpdated } from '@/lib/event-bus';
import { TEMPLATE_FIELDS } from '@/lib/issue-templates';
import { getWorkspaceTemplates } from '@/lib/issue-template-store';
import { ISSUE_SHAPE_SELECT, TemplateRefused, issueShape, updateRefusal } from '@/lib/issue-template-enforcement';
import { assertAssignable, HandoffError } from '@/lib/issue-assignee';
import { assertTokenMayAssign, fromLead, LEAD_CAP, leadPlaces, NOT_DONE, seatWriteGuard } from '@/lib/agent-seats';

// Schema for updating issues
const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'MILESTONE', 'SUBTASK']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.string().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  milestoneId: z.string().cuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  storyPoints: z.number().int().positive().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  color: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  timeEstimateMinutes: z.number().int().positive().nullable().optional(),
});

async function findIssue(issueIdOrKey: string, workspaceId: string) {
  return prisma.issue.findFirst({
    where: {
      workspaceId,
      OR: [
        { id: issueIdOrKey },
        { issueKey: issueIdOrKey },
      ],
    },
  });
}

/**
 * GET /api/apps/auth/issues/:issueIdOrKey
 * Get detailed issue information
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;

      const issue = await prisma.issue.findFirst({
        where: {
          workspaceId: context.workspace.id,
          OR: [
            { id: issueIdOrKey },
            { issueKey: issueIdOrKey },
          ],
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true,
              color: true,
            },
          },
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
          parent: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
            },
          },
          children: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              type: true,
              status: true,
              priority: true,
              assignee: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
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
              isFinal: true,
            },
          },
          _count: {
            select: {
              comments: true,
              children: true,
              sourceRelations: true,
              targetRelations: true,
            },
          },
        },
      });

      if (!issue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Calculate time remaining
      const timeRemaining = issue.timeEstimateMinutes
        ? Math.max(0, issue.timeEstimateMinutes - issue.timeSpentMinutes)
        : null;

      return NextResponse.json({
        id: issue.id,
        issueKey: issue.issueKey,
        title: issue.title,
        description: issue.description,
        type: issue.type,
        status: issue.status || issue.statusValue,
        statusId: issue.statusId,
        projectStatus: issue.projectStatus,
        priority: issue.priority,
        storyPoints: issue.storyPoints,
        dueDate: issue.dueDate,
        startDate: issue.startDate,
        milestoneId: issue.milestoneId,
        baselineStartDate: issue.baselineStartDate,
        baselineDueDate: issue.baselineDueDate,
        finishedAt: issue.finishedAt,
        progress: issue.progress,
        color: issue.color,
        position: issue.position,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        firstStartedAt: issue.firstStartedAt,
        lastProgressAt: issue.lastProgressAt,
        daysInProgress: issue.daysInProgress,
        // Time tracking fields
        timeEstimateMinutes: issue.timeEstimateMinutes,
        timeSpentMinutes: issue.timeSpentMinutes,
        timeRemaining,
        project: issue.project,
        assignee: issue.assignee,
        reporter: issue.reporter,
        parent: issue.parent,
        children: issue.children,
        labels: issue.labels,
        stats: {
          commentCount: issue._count.comments,
          childCount: issue._count.children,
          relationCount: issue._count.sourceRelations + issue._count.targetRelations,
        },
      });
    } catch (error) {
      console.error('Error fetching issue:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:read'] }
);

/**
 * PATCH /api/apps/auth/issues/:issueIdOrKey
 * Update an existing issue
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const updateData = UpdateIssueSchema.parse(body);

      // Find the issue
      const existingIssue = await findIssue(issueIdOrKey, context.workspace.id);
      if (!existingIssue) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      await seatWriteGuard(prisma, context, existingIssue.projectId);

      // A parent must be an issue of this workspace, as on create: checked before anything else looks at it.
      const parent = updateData.parentId ? await prisma.issue.findFirst({
        where: { id: updateData.parentId, workspaceId: context.workspace.id }, select: { projectId: true },
      }) : null;
      if (updateData.parentId && !parent) {
        return NextResponse.json(
          { error: 'parent_issue_not_found', error_description: 'Parent issue not found' },
          { status: 404 }
        );
      }
      if (parent) await seatWriteGuard(prisma, context, parent.projectId);
      if (updateData.parentId !== undefined && existingIssue.parentId && updateData.parentId !== existingIssue.parentId) {
        const oldParent = await prisma.issue.findFirst({ where: { id: existingIssue.parentId }, select: { projectId: true } });
        // A parent that cannot be read here is in Trash: its project is unknown, so a seat is refused and a person is not.
        await seatWriteGuard(prisma, context, oldParent?.projectId ?? '');
      }

      await assertLegacyIssueWriteAllowed(
        existingIssue.id,
        ...(updateData.parentId !== undefined && existingIssue.parentId ? [existingIssue.parentId] : []),
        ...(updateData.parentId ? [updateData.parentId] : []),
      );

      // Build update object
      const update: any = {};

      if (updateData.title !== undefined) update.title = updateData.title;
      if (updateData.description !== undefined) update.description = updateData.description;
      if (updateData.type !== undefined) update.type = updateData.type;
      if (updateData.priority !== undefined) update.priority = updateData.priority;
      if (updateData.storyPoints !== undefined) update.storyPoints = updateData.storyPoints;
      if (updateData.progress !== undefined) update.progress = updateData.progress;
      if (updateData.color !== undefined) update.color = updateData.color;
      if (updateData.milestoneId !== undefined) update.milestoneId = updateData.milestoneId;
      if (updateData.parentId !== undefined) update.parentId = updateData.parentId;
      if (updateData.timeEstimateMinutes !== undefined) update.timeEstimateMinutes = updateData.timeEstimateMinutes;
      if (updateData.dueDate !== undefined) {
        update.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
      }
      if (updateData.startDate !== undefined) {
        update.startDate = updateData.startDate ? new Date(updateData.startDate) : null;
      }

      // Handle assignee change
      let leadAssignment = false;
      if (updateData.assigneeId !== undefined) {
        leadAssignment = await assertTokenMayAssign(prisma, context, updateData.assigneeId, true, true);
        if (updateData.assigneeId) await assertAssignable(prisma, existingIssue, updateData.assigneeId);
        update.assigneeId = updateData.assigneeId;
      }

      // Handle status change
      if (updateData.status !== undefined) {
        const projectStatus = await prisma.projectStatus.findFirst({
          where: {
            projectId: existingIssue.projectId,
            OR: [
              { name: updateData.status },
              { displayName: updateData.status },
            ],
            isActive: true,
          },
        });

        if (projectStatus) {
          update.statusId = projectStatus.id;
          update.statusValue = projectStatus.name;
          update.status = projectStatus.name;

          // Track lifecycle: first time moving to non-initial status
          if (!existingIssue.firstStartedAt && !projectStatus.isDefault) {
            update.firstStartedAt = new Date();
          }
          update.lastProgressAt = new Date();
        } else {
          update.status = updateData.status;
          update.statusValue = updateData.status;
        }
      }

      // Handle labels
      let labelsUpdate = {};
      if (updateData.labels !== undefined) {
        labelsUpdate = {
          labels: {
            set: updateData.labels.map(id => ({ id })),
          },
        };
      }

      // Create activity record for the change
      const oldValues: any = {};
      const changes: { fieldName: string; oldValue: string; newValue: string }[] = [];

      if (updateData.status && updateData.status !== existingIssue.status) {
        changes.push({
          fieldName: 'status',
          oldValue: existingIssue.status || '',
          newValue: updateData.status,
        });
      }
      if (updateData.assigneeId !== undefined && updateData.assigneeId !== existingIssue.assigneeId) {
        changes.push({
          fieldName: 'assignee',
          oldValue: existingIssue.assigneeId || '',
          newValue: updateData.assigneeId || '',
        });
      }
      if (updateData.priority && updateData.priority !== existingIssue.priority) {
        changes.push({
          fieldName: 'priority',
          oldValue: existingIssue.priority,
          newValue: updateData.priority,
        });
      }

      // Agents are held to the workspace's issue templates when a change touches what they cover.
      const guarded = (['description', 'type', ...TEMPLATE_FIELDS] as const).some(key => updateData[key] !== undefined)
        ? await getWorkspaceTemplates(context.workspace.id) : null;

      // Update issue
      let placedByLead = false;
      const updatedIssue = await prisma.$transaction(async tx => {
        if (updateData.milestoneId || (updateData.type && updateData.type !== 'MILESTONE')) {
          const current = await tx.issue.findUniqueOrThrow({
            where: { id: existingIssue.id }, select: { projectId: true, workspaceId: true, type: true },
          });
          if (current.projectId !== existingIssue.projectId) throw new InvalidMilestone('Issue changed; reload and retry');
          await validateMilestone(tx, current, updateData.milestoneId, existingIssue.id);
          if (current.type === 'MILESTONE' && updateData.type && updateData.type !== 'MILESTONE') {
            await assertMilestoneHasNoIssues(tx, existingIssue.id);
          }
        }
        let leadTarget: { name: string } | null = null;
        const currentAssignee = updateData.assigneeId ? await tx.issue.findUniqueOrThrow({
          where: { id: existingIssue.id }, select: { id: true, workspaceId: true, projectId: true, agentRequestRole: true, assigneeId: true },
        }) : null;
        if (leadAssignment && currentAssignee && updateData.assigneeId) {
          if (!await assertTokenMayAssign(tx, context, updateData.assigneeId, true, true)) {
            throw new HandoffError('seat_scope', 'A seat cannot change who an issue is assigned to', 403);
          }
          await seatWriteGuard(tx, context, currentAssignee.projectId);
          await assertAssignable(tx, currentAssignee, updateData.assigneeId);
        }
        // A lead seat's assignment is held to its rules here, on the rows this transaction reads, and leaves its own timeline entry.
        if (updateData.assigneeId && updateData.assigneeId !== currentAssignee?.assigneeId) {
          leadTarget = await leadPlaces(tx, context, currentAssignee!, updateData.assigneeId);
          placedByLead = !!leadTarget;
          if (leadAssignment && !placedByLead) throw new HandoffError('seat_scope', 'A seat cannot change who an issue is assigned to', 403);
        }
        const before = updateData.labels === undefined && !guarded?.enforced ? null : await tx.issue.findUniqueOrThrow({
          where: { id: existingIssue.id }, select: ISSUE_SHAPE_SELECT,
        });
        // Read inside the transaction, so two changes that each look complete cannot combine into an incomplete issue.
        const refusal = before && guarded?.enforced
          ? updateRefusal(guarded.templates, issueShape(before), issueShape({ ...before, ...update, ...(updateData.labels && { labels: updateData.labels }) }))
          : null;
        if (refusal) throw new TemplateRefused(refusal);
        const changed = await tx.issue.update({
          where: { id: existingIssue.id },
          data: {
            ...update,
            ...labelsUpdate,
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                slug: true,
                issuePrefix: true,
              },
            },
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
          },
        });

        // The lead's limit counts open issues, so a done one, or one this request marks done, would be placed uncounted and could be reopened past it.
        if (placedByLead && !await tx.issue.count({ where: { id: existingIssue.id, ...NOT_DONE } })) {
          throw new HandoffError('seat_scope', 'A lead seat assigns only issues that are not done', 403);
        }
        // shortcut: the limit is held where the lead assigns, on what is open then. An issue placed open, then done and
        // reopened, or one restored from Trash, is not refused and counts from then on; hold those paths to it too if a lead ever uses them to get past it.
        if (leadTarget && updateData.assigneeId && await tx.issue.count({ where: { ...fromLead(currentAssignee!.projectId, context.user.id, updateData.assigneeId), id: { not: existingIssue.id } } }) >= LEAD_CAP) {
          throw new HandoffError('lead_cap', `${leadTarget.name} already has ${LEAD_CAP} open issues from the lead; one of them has to be done first`, 429);
        }
        if (before) await enqueueLabelHandoff(tx, context.user.id, changed, before.labels.map(label => label.id));
        if (updateData.assigneeId && updateData.assigneeId !== currentAssignee?.assigneeId) {
          const assignee = { role: 'ASSIGNEE', status: 'APPROVED', approvedAt: new Date(), approvedBy: context.user.id } as const;
          await tx.issueAssignee.upsert({
            where: { issueId_userId: { issueId: existingIssue.id, userId: updateData.assigneeId } },
            create: { issueId: existingIssue.id, userId: updateData.assigneeId, ...assignee }, update: assignee,
          });
        }
        return changed;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      // Create activity records
      for (const change of changes) {
        if (placedByLead && change.fieldName === 'assignee') continue;
        await prisma.issueActivity.create({
          data: {
            action: 'UPDATED',
            itemType: 'ISSUE',
            itemId: existingIssue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            fieldName: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
          },
        });
      }

      // Fire-and-forget Qdrant sync
      emitIssueUpdated(
        updatedIssue,
        changes,
        {
          userId: context.user.id,
          workspaceId: context.workspace.id,
          workspaceName: context.workspace.name || '',
          workspaceSlug: context.workspace.slug || '',
          source: 'mcp-api',
        },
        { async: true }
      ).catch(() => {});

      return NextResponse.json(updatedIssue);
    } catch (error) {
      if (error instanceof TemplateRefused) return NextResponse.json(error.refusal, { status: 422 });
      if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
      if (error instanceof InvalidMilestone) return NextResponse.json({ error: 'invalid_milestone', error_description: error.message }, { status: 400 });
      if (error instanceof InvalidIssueLabels) return NextResponse.json({ error: 'invalid_labels' }, { status: 400 });
      // P2010 with 40001 is the same lost race, reported by the raw row lock in `leadPlaces`.
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001'))) {
        return NextResponse.json({ error: 'issue_conflict', error_description: 'Issue changed; reload and retry' }, { status: 409 });
      }
      if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: 'forge_connected_project', error_description: error.message }, { status: 409 });
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'validation_error',
            error_description: 'Invalid request data',
            details: error.errors,
          },
          { status: 400 }
        );
      }

      console.error('Error updating issue:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['issues:write'], seatWrites: true }
);

/**
 * DELETE /api/apps/auth/issues/:issueIdOrKey
 * Delete an issue
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const projectId = new URL(request.url).searchParams.get('projectId');
      if (!projectId) throw new IssueTrashError(400, 'Project is required');
      await seatWriteGuard(prisma, context, projectId);
      const deletedIssue = await changeIssueTrash({ idOrKey: (await params).issueIdOrKey,
        workspaceId: context.workspace.id, projectId, action: 'TRASHED',
        actor: { userId: context.user.id, client: 'app', appId: context.app.id, installationId: context.installation.id } });
      return NextResponse.json({ message: 'Issue moved to Trash', deletedIssue });
    } catch (error) {
      if (error instanceof HandoffError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
      return issueTrashErrorResponse(error, 'app');
    }
  },
  { requiredScopes: ['issues:write'], seatWrites: true }
);

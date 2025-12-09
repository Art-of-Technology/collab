/**
 * Third-Party App API: Issue Assignment Endpoint
 * POST /api/apps/auth/issues/:issueIdOrKey/assign - Assign/unassign issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

const AssignIssueSchema = z.object({
  assigneeId: z.string().cuid().optional(),
  role: z.enum(['ASSIGNEE', 'HELPER']).optional().default('ASSIGNEE'),
  unassign: z.boolean().optional(),
});

/**
 * POST /api/apps/auth/issues/:issueIdOrKey/assign
 * Assign or unassign an issue
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();
      const data = AssignIssueSchema.parse(body);

      // Find the issue
      const issue = await prisma.issue.findFirst({
        where: {
          workspaceId: context.workspace.id,
          OR: [
            { id: issueIdOrKey },
            { issueKey: issueIdOrKey },
          ],
        },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
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

      const oldAssigneeId = issue.assigneeId;

      // Handle unassign
      if (data.unassign) {
        await prisma.issue.update({
          where: { id: issue.id },
          data: { assigneeId: null },
        });

        // Remove from IssueAssignee if exists
        if (oldAssigneeId) {
          await prisma.issueAssignee.deleteMany({
            where: {
              issueId: issue.id,
              userId: oldAssigneeId,
            },
          });
        }

        // Log activity
        await prisma.boardItemActivity.create({
          data: {
            action: 'UNASSIGNED',
            itemType: 'ISSUE',
            itemId: issue.id,
            userId: context.user.id,
            workspaceId: context.workspace.id,
            fieldName: 'assignee',
            oldValue: oldAssigneeId || '',
            newValue: '',
          },
        });

        return NextResponse.json({
          message: 'Issue unassigned successfully',
          issue: {
            id: issue.id,
            issueKey: issue.issueKey,
            assignee: null,
          },
        });
      }

      // Validate assignee exists in workspace
      if (!data.assigneeId) {
        return NextResponse.json(
          { error: 'validation_error', error_description: 'assigneeId is required when not unassigning' },
          { status: 400 }
        );
      }

      const member = await prisma.workspaceMember.findFirst({
        where: {
          userId: data.assigneeId,
          workspaceId: context.workspace.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      if (!member) {
        return NextResponse.json(
          { error: 'assignee_not_found', error_description: 'User not found in workspace' },
          { status: 404 }
        );
      }

      // Update issue assignee
      const updatedIssue = await prisma.issue.update({
        where: { id: issue.id },
        data: { assigneeId: data.assigneeId },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // Create or update IssueAssignee record
      await prisma.issueAssignee.upsert({
        where: {
          issueId_userId: {
            issueId: issue.id,
            userId: data.assigneeId,
          },
        },
        create: {
          issueId: issue.id,
          userId: data.assigneeId,
          role: data.role || 'ASSIGNEE',
          status: 'APPROVED',
          assignedAt: new Date(),
          approvedAt: new Date(),
          approvedBy: context.user.id,
        },
        update: {
          role: data.role || 'ASSIGNEE',
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: context.user.id,
        },
      });

      // Log activity
      await prisma.boardItemActivity.create({
        data: {
          action: 'ASSIGNED',
          itemType: 'ISSUE',
          itemId: issue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          fieldName: 'assignee',
          oldValue: oldAssigneeId || '',
          newValue: data.assigneeId,
        },
      });

      return NextResponse.json({
        message: 'Issue assigned successfully',
        issue: {
          id: updatedIssue.id,
          issueKey: updatedIssue.issueKey,
        },
        assignee: updatedIssue.assignee,
        assignment: {
          userId: data.assigneeId,
          role: data.role || 'ASSIGNEE',
          user: member.user,
        },
      });
    } catch (error) {
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

      console.error('Error assigning issue:', error);
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

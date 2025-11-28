/**
 * Third-Party App API: Issue Assignment Endpoint
 * POST /api/apps/auth/issues/[issueIdOrKey]/assign - Assign/reassign issue
 * 
 * Required scopes:
 * - issues:write
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for assignment
const AssignIssueSchema = z.object({
  assigneeId: z.string().cuid(),
  role: z.enum(['ASSIGNEE', 'HELPER']).default('ASSIGNEE')
});

// Schema for unassigning
const UnassignIssueSchema = z.object({
  unassign: z.literal(true)
});

/**
 * Helper to find issue by ID or key
 */
async function findIssue(issueIdOrKey: string, workspaceId: string) {
  return prisma.issue.findFirst({
    where: {
      OR: [
        { id: issueIdOrKey },
        { issueKey: issueIdOrKey }
      ],
      workspaceId
    }
  });
}

/**
 * POST /api/apps/auth/issues/[issueIdOrKey]/assign
 * Assign or reassign an issue
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ issueIdOrKey: string }> }) => {
    try {
      const { issueIdOrKey } = await params;
      const body = await request.json();

      // Find the issue
      const issue = await findIssue(issueIdOrKey, context.workspace.id);

      if (!issue) {
        return NextResponse.json(
          { error: 'issue_not_found', error_description: 'Issue not found' },
          { status: 404 }
        );
      }

      // Check if unassigning
      if (body.unassign === true) {
        const previousAssignee = issue.assigneeId;

        // Remove assignment
        const updatedIssue = await prisma.issue.update({
          where: { id: issue.id },
          data: {
            assigneeId: null,
            updatedAt: new Date()
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        });

        // Create activity record
        if (previousAssignee) {
          await prisma.boardItemActivity.create({
            data: {
              action: 'UNASSIGNED',
              itemType: 'ISSUE',
              itemId: issue.id,
              userId: context.user.id,
              workspaceId: context.workspace.id,
              fieldName: 'assignee',
              oldValue: previousAssignee,
              newValue: null
            }
          });
        }

        return NextResponse.json({
          id: updatedIssue.id,
          issueKey: updatedIssue.issueKey,
          assignee: null,
          message: 'Issue unassigned successfully'
        });
      }

      // Assign to user
      const assignData = AssignIssueSchema.parse(body);

      // Validate assignee is a workspace member
      const workspaceMember = await prisma.workspaceMember.findFirst({
        where: {
          userId: assignData.assigneeId,
          workspaceId: context.workspace.id
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      if (!workspaceMember) {
        return NextResponse.json(
          { error: 'assignee_not_found', error_description: 'Assignee is not a member of this workspace' },
          { status: 400 }
        );
      }

      const previousAssignee = issue.assigneeId;

      // Update issue and create/update IssueAssignee record
      const result = await prisma.$transaction(async (tx) => {
        // If role is ASSIGNEE, update the main assignee field
        const issueUpdate: any = {
          updatedAt: new Date()
        };

        if (assignData.role === 'ASSIGNEE') {
          issueUpdate.assigneeId = assignData.assigneeId;
        }

        const updatedIssue = await tx.issue.update({
          where: { id: issue.id },
          data: issueUpdate,
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            project: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        });

        // Upsert IssueAssignee record
        await tx.issueAssignee.upsert({
          where: {
            issueId_userId: {
              issueId: issue.id,
              userId: assignData.assigneeId
            }
          },
          create: {
            issueId: issue.id,
            userId: assignData.assigneeId,
            role: assignData.role,
            status: 'APPROVED',
            assignedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: context.user.id
          },
          update: {
            role: assignData.role,
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedBy: context.user.id
          }
        });

        return updatedIssue;
      });

      // Create activity record
      await prisma.boardItemActivity.create({
        data: {
          action: 'ASSIGNED',
          itemType: 'ISSUE',
          itemId: issue.id,
          userId: context.user.id,
          workspaceId: context.workspace.id,
          fieldName: 'assignee',
          oldValue: previousAssignee,
          newValue: assignData.assigneeId,
          details: JSON.stringify({
            role: assignData.role,
            assigneeName: workspaceMember.user.name
          })
        }
      });

      const response = {
        id: result.id,
        issueKey: result.issueKey,
        assignee: result.assignee,
        assignment: {
          userId: assignData.assigneeId,
          role: assignData.role,
          user: workspaceMember.user
        },
        message: assignData.role === 'HELPER' 
          ? 'Helper added to issue successfully' 
          : 'Issue assigned successfully'
      };

      return NextResponse.json(response);

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



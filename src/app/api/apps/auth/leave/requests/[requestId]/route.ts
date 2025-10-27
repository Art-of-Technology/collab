/**
 * Third-Party App API: Individual Leave Request Endpoints
 * GET /api/apps/auth/leave/requests/[requestId] - Get specific leave request with policyId, status, duration, notes
 * PATCH /api/apps/auth/leave/requests/[requestId] - Update leave request status or notes
 * DELETE /api/apps/auth/leave/requests/[requestId] - Cancel leave request (sets status to CANCELED)
 * 
 * Required scopes:
 * - leave:read for GET
 * - leave:write for PATCH/DELETE
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating leave requests
const UpdateLeaveRequestSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED']).optional(),
  notes: z.string().min(1).max(1000).optional(),
});

/**
 * GET /api/apps/auth/leave/requests/[requestId]
 * Get specific leave request details
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ requestId: string }> }) => {
    try {
      const { requestId } = await params;

      const leaveRequest = await prisma.leaveRequest.findFirst({
        where: {
          id: requestId,
          policy: {
            workspaceId: context.workspace.id
          }
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          policy: {
            select: {
              id: true,
              name: true,
              group: true,
              isPaid: true,
              trackIn: true
            }
          }
        }
      });

      if (!leaveRequest) {
        return NextResponse.json(
          { error: 'leave_request_not_found', error_description: 'Leave request not found' },
          { status: 404 }
        );
      }

      // Check if user can view this request
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: context.user.id,
            workspaceId: context.workspace.id
          }
        }
      });

      const canView = leaveRequest.userId === context.user.id || membership?.role === 'ADMIN';
      if (!canView) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'You can only view your own leave requests' },
          { status: 403 }
        );
      }

      const response = {
        id: leaveRequest.id,
        policyId: leaveRequest.policyId,
        status: leaveRequest.status,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        duration: leaveRequest.duration,
        notes: leaveRequest.notes,
        createdAt: leaveRequest.createdAt,
        updatedAt: leaveRequest.updatedAt,
        user: leaveRequest.user,
        policy: leaveRequest.policy
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching leave request:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['leave:read'] }
);

/**
 * PATCH /api/apps/auth/leave/requests/[requestId]
 * Update specific leave request (approve/reject for admins, update reason for owners)
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ requestId: string }> }) => {
    try {
      const { requestId } = await params;
      const body = await request.json();
      const updateData = UpdateLeaveRequestSchema.parse(body);

      // Get existing leave request
      const existingRequest = await prisma.leaveRequest.findFirst({
        where: {
          id: requestId,
          policy: {
            workspaceId: context.workspace.id
          }
        }
      });

      if (!existingRequest) {
        return NextResponse.json(
          { error: 'leave_request_not_found', error_description: 'Leave request not found' },
          { status: 404 }
        );
      }

      // Check user permissions
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: context.user.id,
            workspaceId: context.workspace.id
          }
        }
      });

      const isOwner = existingRequest.userId === context.user.id;
      const isAdmin = membership?.role === 'ADMIN';

      // Status changes (approve/reject) require admin role
      if (updateData.status && updateData.status !== existingRequest.status) {
        if (!isAdmin) {
          return NextResponse.json(
            { error: 'insufficient_permissions', error_description: 'Admin role required to approve/reject leave requests' },
            { status: 403 }
          );
        }

        // Can't change status of canceled requests
        if (existingRequest.status === 'CANCELED') {
          return NextResponse.json(
            { error: 'invalid_status_change', error_description: 'Cannot change status of canceled requests' },
            { status: 400 }
          );
        }
      }

      // Notes updates can be done by owner (if request is still pending)
      if (updateData.notes && !isOwner) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'Only request owner can update notes' },
          { status: 403 }
        );
      }

      if (updateData.notes && existingRequest.status !== 'PENDING') {
        return NextResponse.json(
          { error: 'invalid_update', error_description: 'Can only update notes for pending requests' },
          { status: 400 }
        );
      }

      // Prepare update data
      const leaveUpdateData: any = {};
      
      if (updateData.notes) {
        leaveUpdateData.notes = updateData.notes;
      }

      if (updateData.status) {
        leaveUpdateData.status = updateData.status;
      }

      // Update the leave request
      const updatedRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: leaveUpdateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          policy: {
            select: {
              id: true,
              name: true,
              group: true,
              isPaid: true,
              trackIn: true
            }
          }
        }
      });

      return NextResponse.json(updatedRequest);

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

      console.error('Error updating leave request:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['leave:write'] }
);

/**
 * DELETE /api/apps/auth/leave/requests/[requestId]
 * Cancel leave request (only owner can cancel, and only if pending or approved)
 */
export const DELETE = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ requestId: string }> }) => {
    try {
      const { requestId } = await params;

      // Get existing leave request
      const existingRequest = await prisma.leaveRequest.findFirst({
        where: {
          id: requestId,
          policy: {
            workspaceId: context.workspace.id
          }
        }
      });

      if (!existingRequest) {
        return NextResponse.json(
          { error: 'leave_request_not_found', error_description: 'Leave request not found' },
          { status: 404 }
        );
      }

      // Check if user can cancel this request (only owner)
      if (existingRequest.userId !== context.user.id) {
        return NextResponse.json(
          { error: 'insufficient_permissions', error_description: 'You can only cancel your own leave requests' },
          { status: 403 }
        );
      }

      // Can only cancel pending or approved requests
      if (!['PENDING', 'APPROVED'].includes(existingRequest.status)) {
        return NextResponse.json(
          { error: 'invalid_cancellation', error_description: 'Can only cancel pending or approved requests' },
          { status: 400 }
        );
      }

      // Update status to canceled instead of deleting
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { 
          status: 'CANCELED'
        }
      });

      return NextResponse.json({ success: true, message: 'Leave request canceled successfully' });

    } catch (error) {
      console.error('Error cancelling leave request:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['leave:write'] }
);

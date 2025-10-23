/**
 * Third-Party App API: Leave Requests Endpoints
 * GET /api/apps/auth/leave/requests - List leave requests with filtering by userId, status, policyId, startDate, endDate
 * POST /api/apps/auth/leave/requests - Create new leave request with policyId, startDate, endDate, duration, notes
 * 
 * Required scopes:
 * - leave:read for GET
 * - leave:write for POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for creating new leave requests
const CreateLeaveRequestSchema = z.object({
  policyId: z.string().cuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  duration: z.enum(['FULL_DAY', 'HALF_DAY']).default('FULL_DAY'),
  notes: z.string().min(1).max(1000),
});

/**
 * GET /api/apps/auth/leave/requests
 * List leave requests with filtering and pagination
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const userId = searchParams.get('userId'); // Filter by specific user
      const status = searchParams.get('status');
      const policyId = searchParams.get('policyId'); // Filter by leave policy
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      const skip = (page - 1) * limit;

      // Build where clause - filter by workspace through policy relationship
      const where: any = {
        policy: {
          workspaceId: context.workspace.id
        }
      };

      // If userId is not provided, show only current user's requests unless user is admin
      if (!userId) {
        const membership = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: {
              userId: context.user.id,
              workspaceId: context.workspace.id
            }
          }
        });

        // Non-admin users can only see their own requests
        if (membership?.role !== 'ADMIN') {
          where.userId = context.user.id;
        }
      } else {
        // Check if user can view other users' requests (admin only)
        const membership = await prisma.workspaceMember.findUnique({
          where: {
            userId_workspaceId: {
              userId: context.user.id,
              workspaceId: context.workspace.id
            }
          }
        });

        if (membership?.role !== 'ADMIN' && userId !== context.user.id) {
          return NextResponse.json(
            { error: 'insufficient_permissions', error_description: 'Admin role required to view other users\' leave requests' },
            { status: 403 }
          );
        }

        where.userId = userId;
      }

      if (status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'].includes(status)) {
        where.status = status;
      }

      if (policyId) {
        where.policyId = policyId;
      }

      if (startDate) {
        where.startDate = {
          gte: new Date(startDate)
        };
      }

      if (endDate) {
        where.endDate = {
          lte: new Date(endDate)
        };
      }

      // Get leave requests with related data
      const [leaveRequests, total] = await Promise.all([
        prisma.leaveRequest.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
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
        }),
        prisma.leaveRequest.count({ where })
      ]);

      const response = {
        leaveRequests: leaveRequests.map(request => ({
          id: request.id,
          policyId: request.policyId,
          status: request.status,
          startDate: request.startDate,
          endDate: request.endDate,
          duration: request.duration,
          notes: request.notes,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
          user: request.user,
          policy: request.policy
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
      console.error('Error fetching leave requests:', error);
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
 * POST /api/apps/auth/leave/requests
 * Create a new leave request
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const leaveData = CreateLeaveRequestSchema.parse(body);

      // Validate dates
      const startDate = new Date(leaveData.startDate);
      const endDate = new Date(leaveData.endDate);

      if (startDate >= endDate) {
        return NextResponse.json(
          { error: 'invalid_dates', error_description: 'End date must be after start date' },
          { status: 400 }
        );
      }

      // Verify the leave policy exists and belongs to the workspace
      const leavePolicy = await prisma.leavePolicy.findFirst({
        where: {
          id: leaveData.policyId,
          workspaceId: context.workspace.id
        }
      });

      if (!leavePolicy) {
        return NextResponse.json(
          { error: 'invalid_policy', error_description: 'Leave policy not found or not accessible' },
          { status: 400 }
        );
      }

      // Check for overlapping leave requests
      const overlappingRequests = await prisma.leaveRequest.findMany({
        where: {
          userId: context.user.id,
          status: { in: ['PENDING', 'APPROVED'] },
          OR: [
            {
              startDate: { lte: endDate },
              endDate: { gte: startDate }
            }
          ]
        }
      });

      if (overlappingRequests.length > 0) {
        return NextResponse.json(
          { error: 'overlapping_request', error_description: 'You have overlapping leave requests for this period' },
          { status: 400 }
        );
      }

      // Create the leave request
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId: context.user.id,
          policyId: leaveData.policyId,
          startDate,
          endDate,
          duration: leaveData.duration,
          notes: leaveData.notes,
          status: 'PENDING'
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

      return NextResponse.json(newLeaveRequest, { status: 201 });

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

      console.error('Error creating leave request:', error);
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

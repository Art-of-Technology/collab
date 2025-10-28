/**
 * Third-Party App API: Workspace Members Endpoints
 * GET /api/apps/auth/workspace/members - List workspace members
 * 
 * Required scopes:
 * - workspace:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/workspace/members
 * List workspace members with pagination
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100 per page
      const role = searchParams.get('role'); // Filter by role
      const status = searchParams.get('status'); // Filter by status
      const search = searchParams.get('search'); // Search by name or email

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id
      };

      if (role && ['ADMIN', 'MEMBER', 'GUEST'].includes(role)) {
        where.role = role;
      }

      if (status && ['ACTIVE', 'INACTIVE', 'PENDING'].includes(status)) {
        where.status = status;
      }

      if (search) {
        where.user = {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
          ]
        };
      }

      // Get members with user details
      const [members, total] = await Promise.all([
        prisma.workspaceMember.findMany({
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
                image: true,
                team: true,
                currentFocus: true,
                role: true
              }
            }
          }
        }),
        prisma.workspaceMember.count({ where })
      ]);

      const response = {
        members: members.map(member => ({
          id: member.id,
          role: member.role,
          status: member.status,
          joinedAt: member.createdAt,
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            image: member.user.image,
            team: member.user.team,
            currentFocus: member.user.currentFocus,
            role: member.user.role
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
      console.error('Error fetching workspace members:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['workspace:read'] }
);

/**
 * Third-Party App API: User Search Endpoint
 * GET /api/apps/auth/search/users - Search workspace members
 * 
 * Required scopes:
 * - search:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/search/users
 * Search workspace members by name, email, or team
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);

      // Search query
      const q = searchParams.get('q') || '';

      // Filters
      const role = searchParams.get('role'); // ADMIN, MEMBER, GUEST
      const team = searchParams.get('team');
      const hasActiveIssues = searchParams.get('hasActiveIssues');

      // Pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        workspaceId: context.workspace.id,
        status: true // Only active members
      };

      // Search by name, email, or team
      if (q) {
        where.OR = [
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { team: { contains: q, mode: 'insensitive' } }
        ];
      }

      // Role filter
      if (role && ['ADMIN', 'MEMBER', 'GUEST', 'OWNER'].includes(role)) {
        where.role = role;
      }

      // Team filter
      if (team) {
        where.OR = [
          { team: { contains: team, mode: 'insensitive' } },
          { user: { team: { contains: team, mode: 'insensitive' } } }
        ];
      }

      // Get members
      const [members, total] = await Promise.all([
        prisma.workspaceMember.findMany({
          where,
          skip,
          take: limit,
          orderBy: [
            { role: 'asc' }, // Admins first
            { user: { name: 'asc' } }
          ],
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                team: true,
                currentFocus: true,
                expertise: true,
                role: true
              }
            }
          }
        }),
        prisma.workspaceMember.count({ where })
      ]);

      // Get issue counts for each member if requested
      let issueCountsMap = new Map<string, { active: number; total: number }>();

      if (hasActiveIssues !== undefined || true) { // Always include issue counts
        const userIds = members.map(m => m.userId);

        // Get active issue counts
        const issueCounts = await prisma.issue.groupBy({
          by: ['assigneeId'],
          where: {
            workspaceId: context.workspace.id,
            assigneeId: { in: userIds }
          },
          _count: { id: true }
        });

        const activeIssueCounts = await prisma.issue.groupBy({
          by: ['assigneeId'],
          where: {
            workspaceId: context.workspace.id,
            assigneeId: { in: userIds },
            projectStatus: { isFinal: false }
          },
          _count: { id: true }
        });

        issueCounts.forEach(item => {
          if (item.assigneeId) {
            issueCountsMap.set(item.assigneeId, {
              total: item._count.id,
              active: 0
            });
          }
        });

        activeIssueCounts.forEach(item => {
          if (item.assigneeId) {
            const existing = issueCountsMap.get(item.assigneeId) || { total: 0, active: 0 };
            existing.active = item._count.id;
            issueCountsMap.set(item.assigneeId, existing);
          }
        });
      }

      // Filter by hasActiveIssues if specified
      let filteredMembers = members;
      if (hasActiveIssues === 'true') {
        filteredMembers = members.filter(m => {
          const counts = issueCountsMap.get(m.userId);
          return counts && counts.active > 0;
        });
      } else if (hasActiveIssues === 'false') {
        filteredMembers = members.filter(m => {
          const counts = issueCountsMap.get(m.userId);
          return !counts || counts.active === 0;
        });
      }

      // Calculate relevance scores
      const scoredResults = filteredMembers.map(member => {
        let relevanceScore = 0;

        if (q) {
          const searchLower = q.toLowerCase();

          // Exact name match
          if (member.user.name?.toLowerCase() === searchLower) {
            relevanceScore += 100;
          } else if (member.user.name?.toLowerCase().includes(searchLower)) {
            relevanceScore += 50;
          }

          // Email match
          if (member.user.email?.toLowerCase().includes(searchLower)) {
            relevanceScore += 40;
          }

          // Display name match
          if (member.displayName?.toLowerCase().includes(searchLower)) {
            relevanceScore += 45;
          }

          // Team match
          const memberTeam = member.team || member.user.team;
          if (memberTeam?.toLowerCase().includes(searchLower)) {
            relevanceScore += 30;
          }
        }

        const issueCounts = issueCountsMap.get(member.userId) || { total: 0, active: 0 };

        return {
          id: member.id,
          user: member.user,
          role: member.role,
          displayName: member.displayName,
          team: member.team || member.user.team,
          currentFocus: member.currentFocus || member.user.currentFocus,
          expertise: member.expertise.length > 0 ? member.expertise : member.user.expertise,
          joinedAt: member.createdAt,
          issues: {
            total: issueCounts.total,
            active: issueCounts.active
          },
          relevance: relevanceScore
        };
      });

      // Sort by relevance if searching
      if (q) {
        scoredResults.sort((a, b) => b.relevance - a.relevance);
      }

      const response = {
        query: q,
        filters: {
          role,
          team,
          hasActiveIssues
        },
        results: scoredResults,
        pagination: {
          page,
          limit,
          total: filteredMembers.length,
          pages: Math.ceil(filteredMembers.length / limit)
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error searching users:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['search:read'] }
);



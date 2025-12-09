/**
 * Third-Party App API: User Search
 * GET /api/apps/auth/search/users - Search workspace members
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * GET /api/apps/auth/search/users
 * Search workspace members by name, email, or team
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get('q');
      const role = searchParams.get('role');
      const team = searchParams.get('team');
      const hasActiveIssues = searchParams.get('hasActiveIssues') === 'true';
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

      // Build filter
      const where: any = {
        workspaceId: context.workspace.id,
      };

      if (query) {
        where.user = {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        };
      }

      if (role && ['ADMIN', 'MEMBER', 'GUEST'].includes(role)) {
        where.role = role;
      }

      if (team) {
        where.OR = [
          { team: { contains: team, mode: 'insensitive' } },
          { user: { team: { contains: team, mode: 'insensitive' } } },
        ];
      }

      const members = await prisma.workspaceMember.findMany({
        where,
        take: limit,
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
            },
          },
        },
      });

      // Get final statuses for active issue calculation
      const finalStatuses = await prisma.projectStatus.findMany({
        where: { isFinal: true, isActive: true },
        select: { id: true },
      });
      const finalStatusIds = finalStatuses.map((s: any) => s.id);

      // Enrich with issue counts
      const results = await Promise.all(
        members.map(async (member: any) => {
          const [activeIssues, totalAssigned, completedIssues] = await Promise.all([
            prisma.issue.count({
              where: {
                workspaceId: context.workspace.id,
                assigneeId: member.userId,
                statusId: { notIn: finalStatusIds },
              },
            }),
            prisma.issue.count({
              where: {
                workspaceId: context.workspace.id,
                assigneeId: member.userId,
              },
            }),
            prisma.issue.count({
              where: {
                workspaceId: context.workspace.id,
                assigneeId: member.userId,
                statusId: { in: finalStatusIds },
              },
            }),
          ]);

          return {
            memberId: member.id,
            role: member.role,
            team: member.team || member.user.team,
            displayName: member.displayName,
            currentFocus: member.currentFocus || member.user.currentFocus,
            expertise: member.expertise.length > 0 ? member.expertise : member.user.expertise,
            joinedAt: member.createdAt,
            user: member.user,
            issues: {
              active: activeIssues,
              total: totalAssigned,
              completed: completedIssues,
            },
          };
        })
      );

      // Filter by hasActiveIssues if requested
      const filteredResults = hasActiveIssues
        ? results.filter((r: any) => r.issues.active > 0)
        : results;

      return NextResponse.json({
        query,
        results: filteredResults,
        total: filteredResults.length,
        filters: {
          query,
          role,
          team,
          hasActiveIssues,
        },
      });
    } catch (error) {
      console.error('Error searching users:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['workspace:read'] }
);

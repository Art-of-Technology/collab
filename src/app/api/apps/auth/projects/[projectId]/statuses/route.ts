/**
 * Third-Party App API: Project Statuses Endpoint
 * GET /api/apps/auth/projects/:projectId/statuses - Get workflow statuses
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/projects/:projectId/statuses
 * Get workflow statuses for a project with issue counts
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      const statuses = await prisma.projectStatus.findMany({
        where: {
          projectId,
          isActive: true,
        },
        orderBy: { order: 'asc' },
      });

      // Get issue counts for each status
      const statusesWithCounts = await Promise.all(
        statuses.map(async (status) => {
          const count = await prisma.issue.count({
            where: {
              projectId,
              statusId: status.id,
            },
          });

          return {
            id: status.id,
            name: status.name,
            displayName: status.displayName,
            description: status.description,
            color: status.color,
            iconName: status.iconName,
            order: status.order,
            isDefault: status.isDefault,
            isFinal: status.isFinal,
            issueCount: count,
          };
        })
      );

      // Calculate summary stats
      const totalIssues = statusesWithCounts.reduce((sum, s) => sum + s.issueCount, 0);
      const issuesInFinalStatus = statusesWithCounts
        .filter(s => s.isFinal)
        .reduce((sum, s) => sum + s.issueCount, 0);

      return NextResponse.json({
        projectId,
        projectName: project.name,
        statuses: statusesWithCounts.map(s => ({
          ...s,
          percentage: totalIssues > 0 ? Math.round((s.issueCount / totalIssues) * 100) : 0,
        })),
        summary: {
          totalIssues,
          issuesInFinalStatus,
          completionRate: totalIssues > 0 ? Math.round((issuesInFinalStatus / totalIssues) * 100) : 0,
        },
      });
    } catch (error) {
      console.error('Error fetching project statuses:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['projects:read'] }
);

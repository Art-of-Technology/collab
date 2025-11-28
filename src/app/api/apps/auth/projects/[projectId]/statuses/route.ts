/**
 * Third-Party App API: Project Statuses Endpoint
 * GET /api/apps/auth/projects/[projectId]/statuses - List project statuses
 * 
 * Required scopes:
 * - projects:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/apps/auth/projects/[projectId]/statuses
 * Get project statuses with issue counts
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext, { params }: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(request.url);
      const includeInactive = searchParams.get('includeInactive') === 'true';

      // Verify project exists and belongs to workspace
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: context.workspace.id
        }
      });

      if (!project) {
        return NextResponse.json(
          { error: 'project_not_found', error_description: 'Project not found' },
          { status: 404 }
        );
      }

      // Build where clause
      const where: any = {
        projectId: project.id
      };

      if (!includeInactive) {
        where.isActive = true;
      }

      // Get statuses with issue counts
      const statuses = await prisma.projectStatus.findMany({
        where,
        orderBy: { order: 'asc' },
        include: {
          _count: {
            select: { issues: true }
          }
        }
      });

      // Get total issues in project
      const totalIssues = await prisma.issue.count({
        where: { projectId: project.id }
      });

      const response = {
        projectId: project.id,
        projectName: project.name,
        statuses: statuses.map(status => ({
          id: status.id,
          name: status.name,
          displayName: status.displayName,
          description: status.description,
          color: status.color,
          iconName: status.iconName,
          order: status.order,
          isDefault: status.isDefault,
          isActive: status.isActive,
          isFinal: status.isFinal,
          issueCount: status._count.issues,
          percentage: totalIssues > 0 
            ? Math.round((status._count.issues / totalIssues) * 100) 
            : 0
        })),
        summary: {
          totalStatuses: statuses.length,
          activeStatuses: statuses.filter(s => s.isActive).length,
          totalIssues,
          issuesInFinalStatus: statuses
            .filter(s => s.isFinal)
            .reduce((sum, s) => sum + s._count.issues, 0)
        }
      };

      return NextResponse.json(response);

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



import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authConfig);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId } = await params;

    // Resolve workspace slug/ID to actual workspace ID
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Verify user has access to workspace (must be owner or ACTIVE member)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: (session.user as any).id },
          { members: { some: { userId: (session.user as any).id, status: true } } }
        ]
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Fetch all active projects with their issues' date aggregations
    const projects = await prisma.project.findMany({
      where: {
        workspaceId,
        OR: [
          { isArchived: false },
          { isArchived: null }
        ]
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        description: true,
        createdAt: true,
        issues: {
          select: {
            startDate: true,
            dueDate: true,
          },
          where: {
            OR: [
              { startDate: { not: null } },
              { dueDate: { not: null } }
            ]
          }
        },
        _count: {
          select: {
            issues: true
          }
        }
      },
      orderBy: [
        { updatedAt: 'desc' }
      ]
    });

    // Process projects to calculate timeline data
    const ganttData = projects.map(project => {
      let minStartDate: Date | null = null;
      let maxDueDate: Date | null = null;

      // Calculate min startDate and max dueDate from issues
      project.issues.forEach(issue => {
        if (issue.startDate) {
          const startDate = new Date(issue.startDate);
          if (!minStartDate || startDate < minStartDate) {
            minStartDate = startDate;
          }
        }
        if (issue.dueDate) {
          const dueDate = new Date(issue.dueDate);
          if (!maxDueDate || dueDate > maxDueDate) {
            maxDueDate = dueDate;
          }
        }
      });

      // If no dates found, use project creation date as start
      // and creation date + 30 days as end
      if (!minStartDate && !maxDueDate) {
        minStartDate = new Date(project.createdAt);
        maxDueDate = new Date(project.createdAt);
        maxDueDate.setDate(maxDueDate.getDate() + 30);
      } else if (!minStartDate && maxDueDate) {
        // If only dueDate exists, set startDate 30 days before
        minStartDate = new Date(maxDueDate);
        minStartDate.setDate(minStartDate.getDate() - 30);
      } else if (minStartDate && !maxDueDate) {
        // If only startDate exists, set dueDate 30 days after
        maxDueDate = new Date(minStartDate);
        maxDueDate.setDate(maxDueDate.getDate() + 30);
      }

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color || '#3b82f6',
        description: project.description,
        startDate: minStartDate?.toISOString(),
        dueDate: maxDueDate?.toISOString(),
        issueCount: project._count.issues,
        issuesWithDates: project.issues.length
      };
    });

    return NextResponse.json({ projects: ganttData });

  } catch (error) {
    console.error('Error fetching projects gantt data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

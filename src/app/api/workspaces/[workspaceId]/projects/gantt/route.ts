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

    // Fetch all active projects with their issues and statuses
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
            id: true,
            startDate: true,
            dueDate: true,
            statusId: true,
            projectStatus: {
              select: {
                isFinal: true,
                name: true,
              }
            }
          }
        },
        statuses: {
          select: {
            id: true,
            name: true,
            isFinal: true,
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

    const now = new Date();

    // Process projects to calculate timeline and progress data
    const ganttData = projects.map(project => {
      let minStartDate: Date | null = null;
      let maxDueDate: Date | null = null;
      let issuesWithDates = 0;
      let completedIssues = 0;
      let overdueIssues = 0;

      // Calculate metrics from issues
      project.issues.forEach(issue => {
        const isCompleted = issue.projectStatus?.isFinal === true;
        if (isCompleted) {
          completedIssues++;
        }

        // Check if issue has dates
        const hasDate = issue.startDate || issue.dueDate;
        if (hasDate) {
          issuesWithDates++;
        }

        // Track overdue non-completed issues
        if (issue.dueDate && !isCompleted) {
          const dueDate = new Date(issue.dueDate);
          if (dueDate < now) {
            overdueIssues++;
          }
        }

        // Calculate date range
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

      const totalIssues = project._count.issues;
      const progress = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

      // Determine if we have real date data
      const hasRealDates = minStartDate !== null || maxDueDate !== null;

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

      // Calculate health status
      let health: 'on_track' | 'at_risk' | 'overdue' | 'completed' | 'no_data' = 'no_data';

      if (!hasRealDates) {
        health = 'no_data';
      } else if (progress === 100) {
        health = 'completed';
      } else if (overdueIssues > 0) {
        health = 'overdue';
      } else if (maxDueDate && maxDueDate < now) {
        health = 'overdue';
      } else if (maxDueDate) {
        // Calculate expected progress based on time elapsed
        const totalDuration = maxDueDate.getTime() - (minStartDate?.getTime() || project.createdAt.getTime());
        const elapsed = now.getTime() - (minStartDate?.getTime() || project.createdAt.getTime());
        const expectedProgress = totalDuration > 0 ? Math.min(100, Math.round((elapsed / totalDuration) * 100)) : 0;

        // At risk if actual progress is more than 20% behind expected
        if (progress < expectedProgress - 20) {
          health = 'at_risk';
        } else {
          health = 'on_track';
        }
      } else {
        health = 'on_track';
      }

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color || '#3b82f6',
        description: project.description,
        startDate: minStartDate?.toISOString(),
        dueDate: maxDueDate?.toISOString(),
        issueCount: totalIssues,
        issuesWithDates,
        completedIssues,
        overdueIssues,
        progress,
        health,
        hasRealDates
      };
    });

    // Sort: prioritize projects with real data and health issues
    const sortedGanttData = ganttData.sort((a, b) => {
      // Projects with real dates first
      if (a.hasRealDates && !b.hasRealDates) return -1;
      if (!a.hasRealDates && b.hasRealDates) return 1;

      // Then by health (overdue/at_risk first)
      const healthOrder = { overdue: 0, at_risk: 1, on_track: 2, completed: 3, no_data: 4 };
      return healthOrder[a.health] - healthOrder[b.health];
    });

    return NextResponse.json({ projects: sortedGanttData });

  } catch (error) {
    console.error('Error fetching projects gantt data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

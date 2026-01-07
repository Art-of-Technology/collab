import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    // Get the project to verify access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user has access to workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        user: { email: session.user.email },
        workspaceId: project.workspaceId,
        status: true
      }
    });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const twoDaysFromNow = new Date(now);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    // Get all statuses to identify final (done) statuses
    const projectStatuses = await prisma.projectStatus.findMany({
      where: { projectId, isActive: true },
      select: { id: true, isFinal: true, name: true, displayName: true, color: true }
    });

    const finalStatusIds = projectStatuses
      .filter(s => s.isFinal)
      .map(s => s.id);

    // Get issue counts by status
    const issueCounts = await prisma.issue.groupBy({
      by: ['statusId'],
      where: { projectId },
      _count: { id: true }
    });

    // Build status distribution
    const statusDistribution = projectStatuses.map(status => ({
      id: status.id,
      name: status.name,
      displayName: status.displayName,
      color: status.color,
      isFinal: status.isFinal,
      count: issueCounts.find(c => c.statusId === status.id)?._count.id || 0
    }));

    // Get overdue issues (dueDate < now AND not in final status)
    const overdueIssues = await prisma.issue.findMany({
      where: {
        projectId,
        dueDate: { lt: now },
        OR: [
          { statusId: { notIn: finalStatusIds } },
          { statusId: null }
        ]
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        dueDate: true,
        priority: true,
        assignee: {
          select: { id: true, name: true, image: true }
        },
        projectStatus: {
          select: { id: true, name: true, displayName: true, color: true }
        },
        parent: {
          select: { id: true, title: true, issueKey: true }
        },
        // Check if blocked
        targetRelations: {
          where: { relationType: 'BLOCKS' },
          select: {
            sourceIssue: {
              select: { id: true, title: true, issueKey: true }
            }
          }
        }
      },
      orderBy: { dueDate: 'asc' },
      take: 10
    });

    // Get at-risk issues (due within 2 days, not started or minimal progress, not in final status)
    const atRiskIssues = await prisma.issue.findMany({
      where: {
        projectId,
        dueDate: {
          gte: now,
          lte: twoDaysFromNow
        },
        OR: [
          { statusId: { notIn: finalStatusIds } },
          { statusId: null }
        ]
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        dueDate: true,
        priority: true,
        assignee: {
          select: { id: true, name: true, image: true }
        },
        projectStatus: {
          select: { id: true, name: true, displayName: true, color: true }
        },
        parent: {
          select: { id: true, title: true, issueKey: true }
        }
      },
      orderBy: { dueDate: 'asc' },
      take: 10
    });

    // Get recently updated issues
    const recentIssues = await prisma.issue.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        issueKey: true,
        updatedAt: true,
        priority: true,
        assignee: {
          select: { id: true, name: true, image: true }
        },
        projectStatus: {
          select: { id: true, name: true, displayName: true, color: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 5
    });

    // Get recently completed issues (completed in last 30 days)
    const recentlyCompletedIssues = await prisma.issue.findMany({
      where: {
        projectId,
        statusId: { in: finalStatusIds },
        updatedAt: { gte: thirtyDaysAgo }
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        updatedAt: true,
        assignee: {
          select: { id: true, name: true, image: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });

    // Calculate summary stats
    const totalIssues = issueCounts.reduce((sum, c) => sum + c._count.id, 0);
    const completedIssues = issueCounts
      .filter(c => finalStatusIds.includes(c.statusId || ''))
      .reduce((sum, c) => sum + c._count.id, 0);
    const openIssues = totalIssues - completedIssues;

    // Get issues with no dates
    const issuesWithoutDates = await prisma.issue.count({
      where: {
        projectId,
        dueDate: null,
        OR: [
          { statusId: { notIn: finalStatusIds } },
          { statusId: null }
        ]
      }
    });

    // Get unassigned issues count
    const unassignedIssues = await prisma.issue.count({
      where: {
        projectId,
        assigneeId: null,
        OR: [
          { statusId: { notIn: finalStatusIds } },
          { statusId: null }
        ]
      }
    });

    // Transform overdue issues
    const transformedOverdue = overdueIssues.map(issue => ({
      id: issue.id,
      title: issue.title,
      issueKey: issue.issueKey,
      dueDate: issue.dueDate?.toISOString(),
      daysOverdue: issue.dueDate ? Math.ceil((now.getTime() - issue.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      priority: issue.priority,
      assignee: issue.assignee,
      status: issue.projectStatus,
      epic: issue.parent,
      blockedBy: issue.targetRelations.map(r => r.sourceIssue)
    }));

    // Transform at-risk issues
    const transformedAtRisk = atRiskIssues.map(issue => ({
      id: issue.id,
      title: issue.title,
      issueKey: issue.issueKey,
      dueDate: issue.dueDate?.toISOString(),
      daysUntilDue: issue.dueDate ? Math.ceil((issue.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      priority: issue.priority,
      assignee: issue.assignee,
      status: issue.projectStatus,
      epic: issue.parent
    }));

    // Get upcoming issues for timeline widget (next 30 days with due dates)
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const timelineIssues = await prisma.issue.findMany({
      where: {
        projectId,
        dueDate: {
          gte: now,
          lte: thirtyDaysFromNow
        }
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        dueDate: true,
        priority: true,
        assignee: {
          select: { id: true, name: true, image: true }
        },
        projectStatus: {
          select: { id: true, name: true, displayName: true, color: true, isFinal: true }
        },
        parent: {
          select: { id: true, title: true, issueKey: true }
        }
      },
      orderBy: { dueDate: 'asc' },
      take: 20
    });

    // Get GitHub repository and activity
    const repository = await prisma.repository.findFirst({
      where: { projectId },
      select: { id: true, fullName: true }
    });

    let githubActivity: any[] = [];
    if (repository) {
      // Get commits
      const commits = await prisma.commit.findMany({
        where: { repositoryId: repository.id },
        orderBy: { commitDate: 'desc' },
        take: 5,
        select: {
          id: true,
          sha: true,
          message: true,
          authorName: true,
          commitDate: true,
        },
      });

      // Get pull requests
      const pullRequests = await prisma.pullRequest.findMany({
        where: { repositoryId: repository.id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          githubPrId: true,
          title: true,
          state: true,
          createdAt: true,
          mergedAt: true,
          createdBy: {
            select: { name: true },
          },
        },
      });

      // Get releases
      const releases = await prisma.release.findMany({
        where: { repositoryId: repository.id },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: {
          id: true,
          tagName: true,
          name: true,
          publishedAt: true,
        },
      });

      // Build activity feed
      commits.forEach(commit => {
        githubActivity.push({
          id: `commit-${commit.id}`,
          type: 'commit',
          title: 'pushed a commit',
          description: commit.message.split('\n')[0],
          timestamp: commit.commitDate?.toISOString() || new Date().toISOString(),
          author: { name: commit.authorName },
          metadata: { sha: commit.sha },
        });
      });

      pullRequests.forEach(pr => {
        const action = pr.state === 'MERGED' ? 'merged' :
                      pr.state === 'OPEN' ? 'opened' : 'closed';
        githubActivity.push({
          id: `pr-${pr.id}`,
          type: 'pull_request',
          title: `${action} PR #${pr.githubPrId}`,
          description: pr.title,
          timestamp: (pr.mergedAt || pr.createdAt).toISOString(),
          author: { name: pr.createdBy?.name || 'Unknown' },
          metadata: { prNumber: pr.githubPrId, prState: pr.state },
        });
      });

      releases.forEach(release => {
        githubActivity.push({
          id: `release-${release.id}`,
          type: 'release',
          title: `released ${release.tagName}`,
          description: release.name,
          timestamp: release.publishedAt?.toISOString() || new Date().toISOString(),
          author: { name: 'Release' },
          metadata: { tagName: release.tagName },
        });
      });

      // Sort by timestamp
      githubActivity.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      githubActivity = githubActivity.slice(0, 10);
    }

    // Get feature requests
    const featureRequests = await prisma.featureRequest.findMany({
      where: { projectId },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        votes: {
          select: { value: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Calculate vote scores
    const formattedFeatureRequests = featureRequests.map((fr) => {
      let voteScore = 0;
      let upvotes = 0;
      let downvotes = 0;

      fr.votes.forEach(vote => {
        if (vote.value === 1) {
          voteScore++;
          upvotes++;
        } else if (vote.value === -1) {
          voteScore--;
          downvotes++;
        }
      });

      return {
        id: fr.id,
        title: fr.title,
        description: fr.description,
        status: fr.status,
        voteScore,
        upvotes,
        downvotes,
        createdAt: fr.createdAt.toISOString(),
        author: fr.author,
        _count: fr._count,
      };
    });

    // Sort by vote score
    formattedFeatureRequests.sort((a, b) => b.voteScore - a.voteScore);

    // Get notes for the workspace
    const notes = await prisma.note.findMany({
      where: {
        workspaceId: project.workspaceId,
        isPublic: true,
      },
      include: {
        tags: true,
        author: {
          select: { id: true, name: true, image: true },
        },
        comments: {
          select: { id: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const formattedNotes = notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      isPublic: note.isPublic,
      isFavorite: note.isFavorite,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      author: note.author,
      tags: note.tags,
      comments: note.comments,
    }));

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        color: project.color,
      },
      stats: {
        totalIssues,
        openIssues,
        completedIssues,
        overdueCount: overdueIssues.length,
        atRiskCount: atRiskIssues.length,
        issuesWithoutDates,
        unassignedIssues,
        completionRate: totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0
      },
      statusDistribution,
      atRisk: {
        overdue: transformedOverdue,
        upcoming: transformedAtRisk
      },
      recentIssues: recentIssues.map(issue => ({
        id: issue.id,
        title: issue.title,
        issueKey: issue.issueKey,
        updatedAt: issue.updatedAt.toISOString(),
        priority: issue.priority,
        assignee: issue.assignee,
        status: issue.projectStatus
      })),
      recentlyCompleted: recentlyCompletedIssues.map(issue => ({
        id: issue.id,
        title: issue.title,
        issueKey: issue.issueKey,
        completedAt: issue.updatedAt.toISOString(),
        assignee: issue.assignee
      })),
      // Timeline widget data
      timeline: timelineIssues.map(issue => ({
        id: issue.id,
        title: issue.title,
        issueKey: issue.issueKey,
        dueDate: issue.dueDate?.toISOString(),
        priority: issue.priority,
        assignee: issue.assignee,
        status: issue.projectStatus,
        parent: issue.parent
      })),
      // GitHub widget data
      github: {
        connected: !!repository,
        repositoryName: repository?.fullName || null,
        activities: githubActivity
      },
      // Feature requests widget data
      featureRequests: formattedFeatureRequests,
      // Notes widget data
      notes: formattedNotes
    });

  } catch (error) {
    console.error('Error fetching project summary:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

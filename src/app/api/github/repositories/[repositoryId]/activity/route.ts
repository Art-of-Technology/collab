import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ActivityItem {
  id: string;
  type: 'commit' | 'pull_request' | 'review' | 'release' | 'branch' | 'deployment';
  title: string;
  description?: string;
  timestamp: string;
  author: {
    name: string;
    avatar?: string;
    login?: string;
  };
  metadata?: {
    sha?: string;
    prNumber?: number;
    prState?: string;
    reviewState?: string;
    tagName?: string;
    branchName?: string;
    environment?: string;
    status?: string;
    githubUrl?: string;
  };
}

// GET /api/github/repositories/[repositoryId]/activity - Get activity feed
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type');

    const activities: ActivityItem[] = [];

    // Get commits
    if (!type || type === 'commit') {
      const commits = await prisma.commit.findMany({
        where: { repositoryId },
        orderBy: { commitDate: 'desc' },
        take: Math.floor(limit / 2),
        select: {
          id: true,
          sha: true,
          message: true,
          authorName: true,
          authorEmail: true,
          commitDate: true,
        },
      });

      commits.forEach(commit => {
        activities.push({
          id: `commit-${commit.id}`,
          type: 'commit',
          title: 'pushed a commit',
          description: commit.message.split('\n')[0],
          timestamp: commit.commitDate?.toISOString() || new Date().toISOString(),
          author: {
            name: commit.authorName,
          },
          metadata: {
            sha: commit.sha,
          },
        });
      });
    }

    // Get pull requests
    if (!type || type === 'pull_request') {
      const pullRequests = await prisma.pullRequest.findMany({
        where: { repositoryId },
        orderBy: { updatedAt: 'desc' },
        take: Math.floor(limit / 3),
        select: {
          id: true,
          githubPrId: true,
          title: true,
          state: true,
          createdAt: true,
          mergedAt: true,
          createdBy: {
            select: {
              name: true,
            },
          },
        },
      });

      pullRequests.forEach(pr => {
        const action = pr.state === 'MERGED' ? 'merged' :
                      pr.state === 'OPEN' ? 'opened' : 'closed';
        activities.push({
          id: `pr-${pr.id}`,
          type: 'pull_request',
          title: `${action} PR #${pr.githubPrId}`,
          description: pr.title,
          timestamp: (pr.mergedAt || pr.createdAt).toISOString(),
          author: {
            name: pr.createdBy?.name || 'Unknown',
            login: undefined,
          },
          metadata: {
            prNumber: pr.githubPrId,
            prState: pr.state,
            githubUrl: undefined,
          },
        });
      });
    }

    // Get reviews
    if (!type || type === 'review') {
      const reviews = await prisma.pRReview.findMany({
        where: {
          pullRequest: { repositoryId },
        },
        orderBy: { submittedAt: 'desc' },
        take: Math.floor(limit / 4),
        include: {
          pullRequest: {
            select: {
              githubPrId: true,
              title: true,
            },
          },
        },
      });

      reviews.forEach(review => {
        const action = review.state === 'APPROVED' ? 'approved' :
                      review.state === 'CHANGES_REQUESTED' ? 'requested changes on' :
                      'reviewed';
        activities.push({
          id: `review-${review.id}`,
          type: 'review',
          title: `${action} PR #${review.pullRequest.githubPrId}`,
          description: review.body || undefined,
          timestamp: review.submittedAt?.toISOString() || new Date().toISOString(),
          author: {
            name: review.reviewerLogin,
            login: review.reviewerLogin,
          },
          metadata: {
            prNumber: review.pullRequest.githubPrId,
            reviewState: review.state,
          },
        });
      });
    }

    // Get releases
    if (!type || type === 'release') {
      const releases = await prisma.release.findMany({
        where: { repositoryId },
        orderBy: { publishedAt: 'desc' },
        take: Math.floor(limit / 4),
        select: {
          id: true,
          tagName: true,
          name: true,
          publishedAt: true,
          githubUrl: true,
        },
      });

      releases.forEach(release => {
        activities.push({
          id: `release-${release.id}`,
          type: 'release',
          title: `released ${release.tagName}`,
          description: release.name,
          timestamp: release.publishedAt?.toISOString() || new Date().toISOString(),
          author: {
            name: 'Release',
          },
          metadata: {
            tagName: release.tagName,
            githubUrl: release.githubUrl || undefined,
          },
        });
      });
    }

    // Get deployments
    if (!type || type === 'deployment') {
      const deployments = await prisma.deployment.findMany({
        where: { repositoryId },
        orderBy: { deployedAt: 'desc' },
        take: Math.floor(limit / 4),
        include: {
          version: {
            select: {
              version: true,
            },
          },
        },
      });

      deployments.forEach(deployment => {
        activities.push({
          id: `deploy-${deployment.id}`,
          type: 'deployment',
          title: `deployed to ${deployment.environment}`,
          description: deployment.version?.version ? `v${deployment.version.version}` : undefined,
          timestamp: deployment.deployedAt?.toISOString() || deployment.createdAt.toISOString(),
          author: {
            name: deployment.deployedBy || 'System',
          },
          metadata: {
            environment: deployment.environment,
            status: deployment.status,
          },
        });
      });
    }

    // Sort all activities by timestamp
    activities.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ activities: activities.slice(0, limit) });
  } catch (error) {
    console.error('[ACTIVITY_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

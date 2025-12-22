import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

interface RouteParams {
  params: Promise<{
    issueId: string;
  }>;
}

// GET - Get AI reviews for all PRs linked to an issue
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { issueId } = await params;

    // Get the issue with its project and workspace to verify access
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        project: {
          include: {
            workspace: {
              include: {
                members: {
                  where: { userId: user.id },
                },
              },
            },
          },
        },
        pullRequests: {
          include: {
            aiReviews: {
              include: {
                triggeredBy: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!issue || issue.project.workspace.members.length === 0) {
      return NextResponse.json({ error: 'Issue not found or access denied' }, { status: 404 });
    }

    // Flatten AI reviews from all PRs
    const aiReviews = issue.pullRequests.flatMap(pr =>
      pr.aiReviews.map(review => ({
        ...review,
        pullRequest: {
          id: pr.id,
          githubPrId: pr.githubPrId,
          title: pr.title,
          state: pr.state,
        },
      }))
    );

    // Sort by createdAt descending
    aiReviews.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ aiReviews });
  } catch (error) {
    console.error('Error fetching issue AI reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI reviews' },
      { status: 500 }
    );
  }
}

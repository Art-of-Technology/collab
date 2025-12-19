import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Contributor {
  id: string;
  name: string;
  login: string;
  avatar?: string;
  email?: string;
  stats: {
    commits: number;
    pullRequests: number;
    reviews: number;
    linesAdded: number;
    linesRemoved: number;
  };
  recentActivity?: string;
}

// GET /api/github/repositories/[repositoryId]/contributors - Get contributor stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const timeRange = searchParams.get('timeRange') || 'all';

    // Calculate date filter
    let dateFilter: Date | undefined;
    if (timeRange === 'week') {
      dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - 7);
    } else if (timeRange === 'month') {
      dateFilter = new Date();
      dateFilter.setMonth(dateFilter.getMonth() - 1);
    }

    // Get commits grouped by author
    const commitsByAuthor = await prisma.commit.groupBy({
      by: ['authorName', 'authorEmail'],
      where: {
        repositoryId,
        ...(dateFilter && { commitDate: { gte: dateFilter } }),
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    // Get detailed stats for each contributor
    const contributors: Contributor[] = await Promise.all(
      commitsByAuthor.map(async (author, index) => {
        // Get PR count - match by createdBy user name
        const prCount = await prisma.pullRequest.count({
          where: {
            repositoryId,
            createdBy: {
              name: author.authorName,
            },
            ...(dateFilter && { createdAt: { gte: dateFilter } }),
          },
        });

        // Get review count
        const reviewCount = await prisma.pRReview.count({
          where: {
            pullRequest: { repositoryId },
            reviewerLogin: author.authorName,
            ...(dateFilter && { submittedAt: { gte: dateFilter } }),
          },
        });

        // Get most recent activity
        const recentCommit = await prisma.commit.findFirst({
          where: {
            repositoryId,
            authorName: author.authorName,
          },
          orderBy: { commitDate: 'desc' },
          select: { commitDate: true },
        });

        // Aggregate line stats from commits
        const lineStats = await prisma.commit.aggregate({
          where: {
            repositoryId,
            authorName: author.authorName,
            ...(dateFilter && { commitDate: { gte: dateFilter } }),
          },
          _sum: {
            additions: true,
            deletions: true,
          },
        });

        return {
          id: `contributor-${index}`,
          name: author.authorName,
          login: author.authorName.toLowerCase().replace(/\s+/g, '-'),
          email: author.authorEmail || undefined,
          stats: {
            commits: author._count.id,
            pullRequests: prCount,
            reviews: reviewCount,
            linesAdded: lineStats._sum.additions || 0,
            linesRemoved: lineStats._sum.deletions || 0,
          },
          recentActivity: recentCommit?.commitDate?.toISOString(),
        };
      })
    );

    return NextResponse.json({ contributors });
  } catch (error) {
    console.error('[CONTRIBUTORS_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

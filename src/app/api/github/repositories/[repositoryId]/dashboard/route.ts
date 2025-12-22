import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/dashboard - Get dashboard stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;

    // Get repository with counts
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        _count: {
          select: {
            commits: true,
            pullRequests: true,
            versions: true,
            releases: true,
            branches: true,
          },
        },
      },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Get recent commits (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentCommitsCount = await prisma.commit.count({
      where: {
        repositoryId,
        commitDate: { gte: weekAgo },
      },
    });

    // Get open, merged, and total PRs
    const [openPRs, mergedPRs, totalPRs] = await Promise.all([
      prisma.pullRequest.count({
        where: { repositoryId, state: 'OPEN' },
      }),
      prisma.pullRequest.count({
        where: { repositoryId, state: 'MERGED' },
      }),
      prisma.pullRequest.count({
        where: { repositoryId },
      }),
    ]);

    // Get latest release
    const latestRelease = await prisma.release.findFirst({
      where: { repositoryId },
      orderBy: { publishedAt: 'desc' },
      select: {
        tagName: true,
        name: true,
        publishedAt: true,
      },
    });

    // Get total releases count
    const totalReleases = await prisma.release.count({
      where: { repositoryId },
    });

    // Get branch counts (total and recently updated as "active")
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [totalBranches, activeBranches] = await Promise.all([
      prisma.branch.count({
        where: { repositoryId },
      }),
      prisma.branch.count({
        where: {
          repositoryId,
          updatedAt: { gte: monthAgo },
        },
      }),
    ]);

    // Return stats in the format expected by the client
    return NextResponse.json({
      commits: {
        total: repository._count.commits,
        thisWeek: recentCommitsCount,
      },
      pullRequests: {
        open: openPRs,
        merged: mergedPRs,
        total: totalPRs,
      },
      releases: {
        total: totalReleases,
        latest: latestRelease ? {
          tagName: latestRelease.tagName,
          publishedAt: latestRelease.publishedAt?.toISOString() || '',
        } : undefined,
      },
      branches: {
        total: totalBranches,
        active: activeBranches,
      },
    });
  } catch (error) {
    console.error('[DASHBOARD_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

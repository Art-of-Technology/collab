import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { repositoryAccessWhere } from "@/lib/github/access";
import { versionAccessWhere } from "@/lib/github/version-access";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/dashboard - Get dashboard stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { repositoryId } = await params;
    const scope = { repositoryId, repository: repositoryAccessWhere(actor.id) };
    const versionScope = { ...scope, version: versionAccessWhere(actor.id) };

    // Get repository with counts
    const repository = await prisma.repository.findFirst({
      where: { id: repositoryId, ...repositoryAccessWhere(actor.id) },
      include: {
        _count: {
          select: {
            commits: true,
            pullRequests: true,
            versions: { where: versionAccessWhere(actor.id) },
            releases: { where: { version: versionAccessWhere(actor.id) } },
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
        ...scope,
        commitDate: { gte: weekAgo },
      },
    });

    // Get open, merged, and total PRs
    const [openPRs, mergedPRs, totalPRs] = await Promise.all([
      prisma.pullRequest.count({
        where: { ...scope, state: 'OPEN' },
      }),
      prisma.pullRequest.count({
        where: { ...scope, state: 'MERGED' },
      }),
      prisma.pullRequest.count({
        where: scope,
      }),
    ]);

    // Get latest release
    const latestRelease = await prisma.release.findFirst({
      where: versionScope,
      orderBy: { publishedAt: 'desc' },
      select: {
        tagName: true,
        name: true,
        publishedAt: true,
      },
    });

    // Get total releases count
    const totalReleases = await prisma.release.count({
      where: versionScope,
    });

    // Get branch counts (total and recently updated as "active")
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [totalBranches, activeBranches] = await Promise.all([
      prisma.branch.count({
        where: scope,
      }),
      prisma.branch.count({
        where: {
          ...scope,
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
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error('[DASHBOARD_GET]');
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

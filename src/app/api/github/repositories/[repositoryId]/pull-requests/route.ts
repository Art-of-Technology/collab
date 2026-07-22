import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/pull-requests - Get pull requests for a repository
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const state = searchParams.get('state'); // 'OPEN', 'MERGED', 'CLOSED', or null for all

    // Verify repository exists
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Build where clause
    const where: { repositoryId: string; state?: string } = { repositoryId };
    if (state) {
      where.state = state.toUpperCase();
    }

    // Get pull requests with pagination
    const [pullRequests, totalCount] = await Promise.all([
      prisma.pullRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          githubPrId: true,
          title: true,
          state: true,
          createdAt: true,
          mergedAt: true,
          closedAt: true,
          createdBy: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.pullRequest.count({ where }),
    ]);

    // Map createdBy to authorName for frontend compatibility
    const mappedPullRequests = pullRequests.map((pr) => ({
      id: pr.id,
      githubPrId: pr.githubPrId,
      title: pr.title,
      state: pr.state,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      authorName: pr.createdBy?.name || null,
    }));

    return NextResponse.json({
      pullRequests: mappedPullRequests,
      total: totalCount,
      hasMore: offset + pullRequests.length < totalCount,
    });
  } catch (error) {
    console.error('[PULL_REQUESTS_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

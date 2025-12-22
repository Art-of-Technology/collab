import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/commits - Get commits for a repository
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Verify repository exists
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Get commits with pagination
    const [commits, totalCount] = await Promise.all([
      prisma.commit.findMany({
        where: { repositoryId },
        orderBy: { commitDate: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          sha: true,
          message: true,
          authorName: true,
          authorEmail: true,
          commitDate: true,
        },
      }),
      prisma.commit.count({
        where: { repositoryId },
      }),
    ]);

    return NextResponse.json({
      commits,
      total: totalCount,
      hasMore: offset + commits.length < totalCount,
    });
  } catch (error) {
    console.error('[COMMITS_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

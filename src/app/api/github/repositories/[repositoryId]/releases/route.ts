import { requireRepositoryAccess } from '@/lib/github/repository-access';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/releases - Get releases with versions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    await requireRepositoryAccess(repositoryId);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const releases = await prisma.release.findMany({
      where: { repositoryId },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: {
        version: {
          select: {
            id: true,
            version: true,
            status: true,
            environment: true,
            aiSummary: true,
            aiChangelog: true,
            issues: {
              include: {
                issue: {
                  select: {
                    issueKey: true,
                    title: true,
                    type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ releases });
  } catch (error) {
    if (error instanceof Error && ['Unauthorized', 'Repository not found'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 404 });
    }
    console.error('[RELEASES_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

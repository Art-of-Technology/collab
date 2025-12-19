import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/releases - Get releases with versions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
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
    console.error('[RELEASES_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

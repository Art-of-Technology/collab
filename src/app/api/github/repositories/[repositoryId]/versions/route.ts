import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/versions - Get versions for repository
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const { searchParams } = new URL(request.url);
    
    const environment = searchParams.get('environment');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build filter conditions
    const where: any = {
      repositoryId,
    };

    if (environment && environment !== 'all') {
      where.environment = environment;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    // Get versions with related data
    const versions = await prisma.version.findMany({
      where,
      include: {
        issues: {
          include: {
            issue: {
              select: {
                title: true,
                type: true,
                priority: true,
                issueKey: true,
              },
            },
          },
        },
        releases: {
          select: {
            id: true,
            name: true,
            githubUrl: true,
            publishedAt: true,
          },
        },
        deployments: {
          select: {
            id: true,
            environment: true,
            status: true,
            deployedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [
        { major: 'desc' },
        { minor: 'desc' },
        { patch: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return NextResponse.json({ versions });
  } catch (error) {
    console.error('[VERSIONS_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

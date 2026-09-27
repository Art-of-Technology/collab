import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { repositoryAccessWhere } from "@/lib/github/access";
import { versionAccessWhere } from "@/lib/github/version-access";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/releases - Get releases with versions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { repositoryId } = await params;
    const repository = await prisma.repository.findFirst({
      where: { id: repositoryId, ...repositoryAccessWhere(actor.id) }, select: { id: true },
    });
    if (!repository) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get('limit') ?? '20');
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;

    const releases = await prisma.release.findMany({
      where: { repositoryId, repository: repositoryAccessWhere(actor.id), version: versionAccessWhere(actor.id) },
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

    return NextResponse.json({ releases }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error('[RELEASES_GET]');
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

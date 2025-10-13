import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Debug endpoint to help troubleshoot repository connection issues
 * GET /api/github/repositories/debug?projectId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId parameter" }, { status: 400 });
    }

    // Get project with repository
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } },
          ],
        },
      },
      include: {
        repository: true,
        workspace: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // Get all repositories for debugging
    const allRepositories = await prisma.repository.findMany({
      where: {
        project: {
          workspace: {
            OR: [
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id } } },
            ],
          },
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
      },
      project: {
        id: project.id,
        name: project.name,
        repository: project.repository,
        workspace: project.workspace,
      },
      allRepositories,
      debug: {
        timestamp: new Date().toISOString(),
        projectHasRepository: !!project.repository,
        repositoryId: project.repository?.id,
        totalRepositories: allRepositories.length,
      },
    });

  } catch (error) {
    console.error('[GITHUB_REPOSITORY_DEBUG]', error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


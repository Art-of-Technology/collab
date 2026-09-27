import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { repositoryAccessWhere } from "@/lib/github/access";

const repositorySelect = {
  id: true, projectId: true, githubRepoId: true, owner: true, name: true,
  fullName: true, defaultBranch: true, isActive: true, syncedAt: true,
  createdAt: true, updatedAt: true,
  project: { select: { id: true, name: true } },
} as const;

/**
 * Debug endpoint to help troubleshoot repository connection issues
 * GET /api/github/repositories/debug?projectId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
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
        workspace: postWorkspaceAccessWhere(actor.id),
      },
      include: {
        repository: { select: repositorySelect },
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
      where: repositoryAccessWhere(actor.id),
      select: repositorySelect,
    });

    return NextResponse.json({
      user: {
        id: actor.id,
        email: actor.email,
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
    }, { headers: { "Cache-Control": "no-store" } });

  } catch (error) {
    console.error('[GITHUB_REPOSITORY_DEBUG]', error);
    return NextResponse.json({ 
      error: "Internal server error"
    }, { status: 500 });
  }
}


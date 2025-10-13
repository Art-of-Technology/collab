import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId] - Get repository details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryId } = await params;

    const repository = await prisma.repository.findFirst({
      where: {
        id: repositoryId,
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
          include: { workspace: true },
        },
        branches: {
          take: 10,
          orderBy: { updatedAt: 'desc' },
        },
        pullRequests: {
          take: 10,
          where: { state: { in: ['OPEN', 'DRAFT'] } },
          orderBy: { githubUpdatedAt: 'desc' },
        },
        versions: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            branches: true,
            pullRequests: true,
            commits: true,
            versions: true,
          },
        },
      },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    return NextResponse.json({ repository });
  } catch (error) {
    console.error('[GITHUB_REPOSITORY_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/github/repositories/[repositoryId] - Disconnect repository
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryId } = await params;

    console.log(`[GITHUB_REPOSITORY_DELETE] Attempting to delete repository: ${repositoryId} for user: ${session.user.id}`);

    // Verify user has access to the repository's project
    const repository = await prisma.repository.findFirst({
      where: {
        id: repositoryId,
        project: {
          workspace: {
            OR: [
              { ownerId: session.user.id }, // Workspace owners
              { members: { some: { userId: session.user.id } } }, // Workspace members
            ],
          },
        },
      },
      include: {
        project: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!repository) {
      console.error(`[GITHUB_REPOSITORY_DELETE] Repository not found: ${repositoryId} for user: ${session.user.id}`);
      return NextResponse.json(
        { error: "Repository not found or insufficient permissions" },
        { status: 404 }
      );
    }

    console.log(`[GITHUB_REPOSITORY_DELETE] Found repository: ${repository.fullName} (${repository.id}) for user: ${session.user.id}`);

    // Try to delete webhook from GitHub if we have webhook ID and access token
    if (repository.webhookId && repository.accessToken) {
      try {
        await deleteGitHubWebhook(repository.accessToken, repository.owner, repository.name, parseInt(repository.webhookId));
        console.log(`[GITHUB_REPOSITORY_DELETE] Webhook deleted from GitHub: ${repository.webhookId}`);
      } catch (error) {
        console.warn(`[GITHUB_REPOSITORY_DELETE] Failed to delete webhook from GitHub: ${error}`);
        // Don't fail the disconnect if webhook deletion fails
      }
    }

    // Delete repository and all related data (cascades)
    await prisma.repository.delete({
      where: { id: repositoryId },
    });

    console.log(`[GITHUB_REPOSITORY_DELETE] Repository disconnected successfully: ${repository.id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[GITHUB_REPOSITORY_DELETE] Error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Helper function to delete webhook from GitHub
async function deleteGitHubWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok && response.status !== 404) {
    // 404 is OK - webhook might already be deleted
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
}


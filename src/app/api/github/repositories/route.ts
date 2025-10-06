import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// POST /api/github/repositories/connect - Connect a GitHub repository to a project
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, githubRepoId, owner, name, accessToken } = body;

    if (!projectId || !githubRepoId || !owner || !name) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, githubRepoId, owner, name" },
        { status: 400 }
      );
    }

    // Verify user has access to the project
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
      include: { repository: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    if (project.repository) {
      return NextResponse.json(
        { error: "Project already has a connected repository" },
        { status: 400 }
      );
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Create repository connection
    const repository = await prisma.repository.create({
      data: {
        projectId,
        githubRepoId: githubRepoId.toString(),
        owner,
        name,
        fullName: `${owner}/${name}`,
        webhookSecret,
        accessToken: accessToken ? await encryptToken(accessToken) : null,
        syncedAt: new Date(),
      },
      include: {
        project: {
          include: {
            workspace: true,
          },
        },
      },
    });

    // Initialize default version if needed
    await initializeDefaultVersion(repository.id);

    return NextResponse.json({
      repository: {
        id: repository.id,
        projectId: repository.projectId,
        owner: repository.owner,
        name: repository.name,
        fullName: repository.fullName,
        isActive: repository.isActive,
        syncedAt: repository.syncedAt,
        webhookSecret: repository.webhookSecret, // Return for webhook setup
      },
    });
  } catch (error) {
    console.error('[GITHUB_REPOSITORY_CONNECT]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/github/repositories/[repositoryId] - Get repository details
export async function GET(
  request: NextRequest,
  { params }: { params: { repositoryId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryId } = params;

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
  { params }: { params: { repositoryId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryId } = params;

    // Verify user has admin access to the repository's project
    const repository = await prisma.repository.findFirst({
      where: {
        id: repositoryId,
        project: {
          workspace: {
            ownerId: session.user.id, // Only workspace owners can disconnect
          },
        },
      },
    });

    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found or insufficient permissions" },
        { status: 404 }
      );
    }

    // Delete repository and all related data (cascades)
    await prisma.repository.delete({
      where: { id: repositoryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[GITHUB_REPOSITORY_DELETE]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Helper function to encrypt access tokens
async function encryptToken(token: string): Promise<string> {
  // Use your preferred encryption method
  // For now, return the token (in production, implement proper encryption)
  return token;
}

// Helper function to initialize default version
async function initializeDefaultVersion(repositoryId: string) {
  try {
    // Check if any versions exist
    const existingVersion = await prisma.version.findFirst({
      where: { repositoryId },
    });

    if (!existingVersion) {
      // Create initial version 0.1.0
      await prisma.version.create({
        data: {
          repositoryId,
          version: '0.1.0',
          major: 0,
          minor: 1,
          patch: 0,
          releaseType: 'MINOR',
          status: 'RELEASED',
          environment: 'development',
          releasedAt: new Date(),
        },
      });
    }
  } catch (error) {
    console.error('Failed to initialize default version:', error);
    // Don't throw - this is not critical for repository connection
  }
}

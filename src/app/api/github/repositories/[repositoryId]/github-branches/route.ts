import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EncryptionService } from "@/lib/encryption";

// GET /api/github/repositories/[repositoryId]/github-branches - Get branches from database
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;

    // Get repository
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: {
        id: true,
        defaultBranch: true,
      },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Get branches from database (synced by sync endpoint)
    const branches = await prisma.branch.findMany({
      where: { repositoryId },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        headSha: true,
        isDefault: true,
        isProtected: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      branches,
      defaultBranch: repository.defaultBranch || 'main',
    });
  } catch (error) {
    console.error('[GITHUB_BRANCHES_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/github/repositories/[repositoryId]/github-branches - Sync branches from GitHub to DB
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;

    // Get repository with access token
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Get access token
    let accessToken: string | null = null;
    if (repository.accessToken) {
      try {
        accessToken = EncryptionService.decrypt(repository.accessToken);
      } catch (error) {
        console.error('Error decrypting access token:', error);
      }
    }

    if (!accessToken) {
      return NextResponse.json({ error: "No GitHub access token" }, { status: 401 });
    }

    // Fetch branches from GitHub
    const response = await fetch(
      `https://api.github.com/repos/${repository.fullName}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch branches from GitHub" },
        { status: response.status }
      );
    }

    const branches = await response.json();

    // Get default branch info
    const repoResponse = await fetch(
      `https://api.github.com/repos/${repository.fullName}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    let defaultBranch = 'main';
    if (repoResponse.ok) {
      const repoData = await repoResponse.json();
      defaultBranch = repoData.default_branch;
    }

    // Sync branches to database
    const syncedBranches = [];
    for (const branch of branches) {
      const syncedBranch = await prisma.branch.upsert({
        where: {
          repositoryId_name: {
            repositoryId,
            name: branch.name,
          },
        },
        update: {
          headSha: branch.commit.sha,
          isDefault: branch.name === defaultBranch,
          isProtected: branch.protected,
          updatedAt: new Date(),
        },
        create: {
          repositoryId,
          name: branch.name,
          headSha: branch.commit.sha,
          isDefault: branch.name === defaultBranch,
          isProtected: branch.protected,
        },
      });
      syncedBranches.push(syncedBranch);
    }

    // Update repository default branch
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { defaultBranch },
    });

    return NextResponse.json({
      message: `Synced ${syncedBranches.length} branches`,
      branches: syncedBranches,
      defaultBranch,
    });
  } catch (error) {
    console.error('[GITHUB_BRANCHES_SYNC]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

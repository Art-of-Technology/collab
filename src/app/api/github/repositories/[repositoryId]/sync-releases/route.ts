import { syncAccessibleReleases } from '@/lib/github/sync-releases';
import { requireRepositoryAccess } from '@/lib/github/repository-access';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EncryptionService } from "@/lib/encryption";

// POST /api/github/repositories/[repositoryId]/sync-releases - Sync releases from GitHub
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const userId = await requireRepositoryAccess(repositoryId);

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

    // Fetch releases from GitHub
    const response = await fetch(
      `https://api.github.com/repos/${repository.fullName}/releases?per_page=30`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch releases from GitHub" },
        { status: response.status }
      );
    }

    const releases = await response.json();
    const syncedReleases = await syncAccessibleReleases(repositoryId, userId, releases);

    return NextResponse.json({
      message: `Synced ${syncedReleases.length} releases`,
      releases: syncedReleases,
    });
  } catch (error) {
    if (error instanceof Error && ['Unauthorized', 'Repository not found'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 404 });
    }
    console.error('[SYNC_RELEASES_POST]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

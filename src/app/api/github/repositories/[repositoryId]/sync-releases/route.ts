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
    const syncedReleases = [];

    for (const release of releases) {
      // Parse version from tag
      const versionString = release.tag_name.replace(/^v/, '');
      const versionParts = versionString.match(/^(\d+)\.(\d+)\.(\d+)/);

      // Find or create version
      let version = await prisma.version.findFirst({
        where: {
          repositoryId,
          version: versionString,
        },
      });

      if (!version && versionParts) {
        version = await prisma.version.create({
          data: {
            repositoryId,
            version: versionString,
            major: parseInt(versionParts[1]),
            minor: parseInt(versionParts[2]),
            patch: parseInt(versionParts[3]),
            releaseType: 'MINOR',
            status: release.draft ? 'PENDING' : 'RELEASED',
            environment: release.prerelease ? 'staging' : 'production',
            releasedAt: release.published_at ? new Date(release.published_at) : null,
          },
        });
      }

      if (version) {
        // Upsert release
        const syncedRelease = await prisma.release.upsert({
          where: {
            repositoryId_tagName: {
              repositoryId,
              tagName: release.tag_name,
            },
          },
          update: {
            name: release.name || release.tag_name,
            description: release.body,
            isDraft: release.draft,
            isPrerelease: release.prerelease,
            publishedAt: release.published_at ? new Date(release.published_at) : null,
            githubUrl: release.html_url,
          },
          create: {
            repositoryId,
            versionId: version.id,
            githubReleaseId: release.id.toString(),
            tagName: release.tag_name,
            name: release.name || release.tag_name,
            description: release.body,
            isDraft: release.draft,
            isPrerelease: release.prerelease,
            publishedAt: release.published_at ? new Date(release.published_at) : null,
            githubUrl: release.html_url,
          },
        });

        syncedReleases.push(syncedRelease);
      }
    }

    return NextResponse.json({
      message: `Synced ${syncedReleases.length} releases`,
      releases: syncedReleases,
    });
  } catch (error) {
    console.error('[SYNC_RELEASES_POST]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

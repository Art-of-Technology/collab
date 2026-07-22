import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EncryptionService } from "@/lib/encryption";

// POST /api/github/repositories/[repositoryId]/sync - Sync all data from GitHub
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;
    const session = await getServerSession(authConfig);

    // Get repository with project info
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        project: {
          include: {
            workspace: {
              include: {
                members: {
                  where: session?.user?.id ? { userId: session.user.id } : undefined,
                  take: 1,
                }
              }
            }
          }
        }
      }
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Get access token - try repository first, then fall back to user's token
    let accessToken: string | null = null;

    // Try repository's stored token first
    if (repository.accessToken) {
      try {
        accessToken = EncryptionService.decrypt(repository.accessToken);
        console.log('[SYNC] Using repository access token');
      } catch (error) {
        console.error('[SYNC] Error decrypting repository access token:', error);
      }
    }

    // Fall back to current user's GitHub token
    if (!accessToken && session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { githubAccessToken: true },
      });

      if (user?.githubAccessToken) {
        try {
          accessToken = EncryptionService.decrypt(user.githubAccessToken);
          console.log('[SYNC] Using user GitHub access token');

          // Store the token in the repository for future use
          await prisma.repository.update({
            where: { id: repositoryId },
            data: { accessToken: user.githubAccessToken },
          });
        } catch (error) {
          console.error('[SYNC] Error decrypting user access token:', error);
        }
      }
    }

    if (!accessToken) {
      return NextResponse.json({
        error: "No GitHub access token. Please reconnect your GitHub account."
      }, { status: 401 });
    }

    console.log(`[SYNC] Starting sync for ${repository.fullName}`);

    const syncResults = {
      releases: 0,
      branches: 0,
      commits: 0,
      pullRequests: 0,
      errors: [] as string[],
    };

    // Sync branches first (most important)
    try {
      console.log(`[SYNC] Fetching branches for ${repository.fullName}`);
      const branchesResponse = await fetch(
        `https://api.github.com/repos/${repository.fullName}/branches?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (branchesResponse.ok) {
        const branches = await branchesResponse.json();
        console.log(`[SYNC] Found ${branches.length} branches`);

        for (const branch of branches) {
          await prisma.branch.upsert({
            where: {
              repositoryId_name: {
                repositoryId,
                name: branch.name,
              },
            },
            update: {
              headSha: branch.commit.sha,
              isProtected: branch.protected,
              isDefault: branch.name === repository.defaultBranch,
            },
            create: {
              repositoryId,
              name: branch.name,
              headSha: branch.commit.sha,
              isProtected: branch.protected,
              isDefault: branch.name === repository.defaultBranch,
            },
          });
          syncResults.branches++;
        }
      } else {
        const errorText = await branchesResponse.text();
        console.error(`[SYNC] Branches fetch failed: ${branchesResponse.status}`, errorText);
        syncResults.errors.push(`Branches: ${branchesResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('[SYNC] Error syncing branches:', error);
      syncResults.errors.push(`Branches: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Sync recent commits
    try {
      console.log(`[SYNC] Fetching commits for ${repository.fullName}`);
      const commitsResponse = await fetch(
        `https://api.github.com/repos/${repository.fullName}/commits?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (commitsResponse.ok) {
        const commits = await commitsResponse.json();
        console.log(`[SYNC] Found ${commits.length} commits`);

        for (const commit of commits) {
          await prisma.commit.upsert({
            where: { sha: commit.sha },
            update: {
              message: commit.commit.message,
              authorName: commit.commit.author?.name || 'Unknown',
              authorEmail: commit.commit.author?.email || '',
              commitDate: commit.commit.author?.date ? new Date(commit.commit.author.date) : new Date(),
            },
            create: {
              repositoryId,
              sha: commit.sha,
              message: commit.commit.message,
              authorName: commit.commit.author?.name || 'Unknown',
              authorEmail: commit.commit.author?.email || '',
              commitDate: commit.commit.author?.date ? new Date(commit.commit.author.date) : new Date(),
            },
          });
          syncResults.commits++;
        }
      } else {
        const errorText = await commitsResponse.text();
        console.error(`[SYNC] Commits fetch failed: ${commitsResponse.status}`, errorText);
        syncResults.errors.push(`Commits: ${commitsResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('[SYNC] Error syncing commits:', error);
      syncResults.errors.push(`Commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Sync pull requests
    try {
      console.log(`[SYNC] Fetching pull requests for ${repository.fullName}`);
      // Fetch both open and closed PRs
      const [openPRsResponse, closedPRsResponse] = await Promise.all([
        fetch(
          `https://api.github.com/repos/${repository.fullName}/pulls?state=open&per_page=50`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        ),
        fetch(
          `https://api.github.com/repos/${repository.fullName}/pulls?state=closed&per_page=50`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        ),
      ]);

      const allPRs: Array<{
        id: number;
        number: number;
        title: string;
        body: string | null;
        state: string;
        merged_at: string | null;
        closed_at: string | null;
        created_at: string;
        updated_at: string;
        user: { login: string } | null;
        base: { ref: string };
        head: { ref: string };
      }> = [];

      if (openPRsResponse.ok) {
        const openPRs = await openPRsResponse.json();
        allPRs.push(...openPRs);
      }

      if (closedPRsResponse.ok) {
        const closedPRs = await closedPRsResponse.json();
        allPRs.push(...closedPRs);
      }

      console.log(`[SYNC] Found ${allPRs.length} pull requests`);

      for (const pr of allPRs) {
        // Determine state
        let state = 'OPEN';
        if (pr.merged_at) {
          state = 'MERGED';
        } else if (pr.closed_at) {
          state = 'CLOSED';
        }

        await prisma.pullRequest.upsert({
          where: {
            repositoryId_githubPrId: {
              repositoryId,
              githubPrId: pr.number,
            },
          },
          update: {
            title: pr.title,
            description: pr.body,
            state,
            baseBranchName: pr.base.ref,
            headBranchName: pr.head.ref,
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
            authorName: pr.user?.login || 'Unknown',
            githubUpdatedAt: new Date(pr.updated_at),
          },
          create: {
            repositoryId,
            githubPrId: pr.number,
            title: pr.title,
            description: pr.body,
            state,
            baseBranchName: pr.base.ref,
            headBranchName: pr.head.ref,
            authorName: pr.user?.login || 'Unknown',
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
            closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
            githubCreatedAt: new Date(pr.created_at),
            githubUpdatedAt: new Date(pr.updated_at),
          },
        });
        syncResults.pullRequests++;
      }
    } catch (error) {
      console.error('[SYNC] Error syncing pull requests:', error);
      syncResults.errors.push(`Pull Requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Sync releases
    try {
      console.log(`[SYNC] Fetching releases for ${repository.fullName}`);
      const releasesResponse = await fetch(
        `https://api.github.com/repos/${repository.fullName}/releases?per_page=30`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (releasesResponse.ok) {
        const releases = await releasesResponse.json();
        console.log(`[SYNC] Found ${releases.length} releases`);

        for (const release of releases) {
          const versionString = release.tag_name.replace(/^v/, '');
          const versionParts = versionString.match(/^(\d+)\.(\d+)\.(\d+)/);

          let version = await prisma.version.findFirst({
            where: { repositoryId, version: versionString },
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
            await prisma.release.upsert({
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
            syncResults.releases++;
          }
        }
      } else {
        const errorText = await releasesResponse.text();
        console.error(`[SYNC] Releases fetch failed: ${releasesResponse.status}`, errorText);
        syncResults.errors.push(`Releases: ${releasesResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('[SYNC] Error syncing releases:', error);
      syncResults.errors.push(`Releases: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Update sync timestamp
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { syncedAt: new Date() },
    });

    console.log(`[SYNC] Completed for ${repository.fullName}:`, syncResults);

    return NextResponse.json({
      message: 'Sync completed',
      results: syncResults,
      errors: syncResults.errors.length > 0 ? syncResults.errors : undefined,
    });
  } catch (error) {
    console.error('[SYNC_POST]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

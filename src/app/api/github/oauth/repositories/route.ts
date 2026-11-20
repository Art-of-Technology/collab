import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserRepositories } from "@/lib/github/oauth-config";
import { repositoryAccessWhere } from "@/lib/github/access";
import { prisma } from "@/lib/prisma";
import { EncryptionService } from "@/lib/encryption";

/**
 * Get user's GitHub repositories
 * GET /api/github/oauth/repositories?page=1&search=query
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's GitHub access token
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { githubAccessToken: true, githubUsername: true },
    });

    if (!user?.githubAccessToken) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 400 }
      );
    }

    // Decrypt the access token
    const accessToken = EncryptionService.decrypt(user.githubAccessToken);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') as 'created' | 'updated' | 'pushed' | 'full_name' || 'updated';

    // Fetch repositories from GitHub. A search reads every page, so it also finds
    // repositories the picker has not loaded yet.
    let repositories: Awaited<ReturnType<typeof getUserRepositories>>['repositories'] = [];
    let hasMore = false;
    if (search) {
      // shortcut: a search reads at most 1,000 repositories (10 pages of 100); use GitHub's search API if an account has more
      // All ten pages at once: one after another took 16 s for an account with 800 repositories.
      const pages = await Promise.all(Array.from({ length: 10 }, (_, index) =>
        getUserRepositories(accessToken, index + 1, 100, sort, request.signal)
      ));
      repositories = pages.flatMap(result => result.repositories);
    } else {
      ({ repositories, hasMore } = await getUserRepositories(accessToken, page, 30, sort, request.signal));
    }

    // Filter repositories by search term if provided
    let filteredRepos = repositories;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRepos = repositories.filter(repo => 
        repo.name.toLowerCase().includes(searchLower) ||
        repo.full_name.toLowerCase().includes(searchLower) ||
        (repo.description && repo.description.toLowerCase().includes(searchLower))
      );
    }

    // Check which repositories are already connected to projects
    const connectedRepos = await prisma.repository.findMany({
      where: repositoryAccessWhere(actor.id),
      select: { githubRepoId: true, project: { select: { id: true, name: true } } },
    });

    const connectedRepoIds = new Set(connectedRepos.map(r => r.githubRepoId));

    // Add connection status to repositories
    const repositoriesWithStatus = filteredRepos.map(repo => ({
      ...repo,
      isConnected: connectedRepoIds.has(repo.id.toString()),
      connectedProject: connectedRepos.find(r => r.githubRepoId === repo.id.toString())?.project,
    }));

    return NextResponse.json({
      repositories: repositoriesWithStatus,
      hasMore: search ? false : hasMore, // Disable pagination when searching
      currentPage: page,
      githubUser: user.githubUsername,
    }, { headers: { "Cache-Control": "no-store" } });

  } catch (error) {
    console.error('Error fetching GitHub repositories');
    
    // Handle specific GitHub API errors
    if (error instanceof Error) {
      if (error.message.includes('Bad credentials')) {
        return NextResponse.json(
          { error: "GitHub access token expired. Please reconnect your account." },
          { status: 401 }
        );
      }
      
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: "GitHub API rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}


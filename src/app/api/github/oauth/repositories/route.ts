import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { getUserRepositories } from "@/lib/github/oauth-config";
import { prisma } from "@/lib/prisma";

/**
 * Get user's GitHub repositories
 * GET /api/github/oauth/repositories?page=1&search=query
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's GitHub access token
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { githubAccessToken: true, githubUsername: true },
    });

    if (!user?.githubAccessToken) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') as 'created' | 'updated' | 'pushed' | 'full_name' || 'updated';

    // Fetch repositories from GitHub
    const { repositories, hasMore } = await getUserRepositories(
      user.githubAccessToken,
      page,
      30,
      sort
    );

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
    });

  } catch (error) {
    console.error('Error fetching GitHub repositories:', error);
    
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


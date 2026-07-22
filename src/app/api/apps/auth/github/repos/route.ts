/**
 * Third-Party App API: GitHub Repositories Endpoint
 * GET /api/apps/auth/github/repos - Lists user's accessible GitHub repositories
 *
 * Used by Coclaw (via MCP) to discover which repos the user can clone/push to.
 * Fetches repos from GitHub API using the user's stored OAuth token.
 *
 * Query params:
 *   - per_page: number of repos per page (default 30, max 100)
 *   - page: page number (default 1)
 *   - sort: created | updated | pushed | full_name (default: updated)
 *   - type: all | owner | public | private | member (default: all)
 *   - search: filter by name (client-side filtering)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { EncryptionService } from '@/lib/encryption';

export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const perPage = Math.min(parseInt(searchParams.get('per_page') || '30'), 100);
      const page = parseInt(searchParams.get('page') || '1');
      const sort = searchParams.get('sort') || 'updated';
      const type = searchParams.get('type') || 'all';
      const searchQuery = searchParams.get('search') || '';

      const user = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: { githubAccessToken: true },
      });

      if (!user?.githubAccessToken) {
        return NextResponse.json(
          {
            connected: false,
            error: 'GitHub account not connected.',
            repos: [],
          },
          { status: 404 }
        );
      }

      const accessToken = EncryptionService.decrypt(user.githubAccessToken);

      // Fetch repos from GitHub API
      const ghResponse = await fetch(
        `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=${sort}&type=${type}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Collab-Platform',
          },
        }
      );

      if (!ghResponse.ok) {
        const errorText = await ghResponse.text();
        console.error('GitHub API error:', ghResponse.status, errorText);
        return NextResponse.json(
          { error: `GitHub API error: ${ghResponse.status}`, repos: [] },
          { status: ghResponse.status === 401 ? 401 : 502 }
        );
      }

      let repos = await ghResponse.json();

      // Client-side search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        repos = repos.filter((r: any) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q))
        );
      }

      // Map to a clean shape
      const mapped = repos.map((r: any) => ({
        id: r.id,
        fullName: r.full_name,
        owner: r.owner?.login,
        name: r.name,
        description: r.description,
        private: r.private,
        defaultBranch: r.default_branch,
        language: r.language,
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url,
        sshUrl: r.ssh_url,
        updatedAt: r.updated_at,
        pushedAt: r.pushed_at,
        permissions: {
          admin: r.permissions?.admin || false,
          push: r.permissions?.push || false,
          pull: r.permissions?.pull || false,
        },
      }));

      // Check link header for pagination
      const linkHeader = ghResponse.headers.get('Link');
      const hasNextPage = linkHeader?.includes('rel="next"') || false;

      return NextResponse.json({
        connected: true,
        repos: mapped,
        pagination: {
          page,
          perPage,
          hasNextPage,
          total: mapped.length,
        },
      });
    } catch (error) {
      console.error('GitHub repos endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GitHub repositories' },
        { status: 500 }
      );
    }
  }
);

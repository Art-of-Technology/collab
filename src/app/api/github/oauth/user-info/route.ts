import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EncryptionService } from "@/lib/encryption";

/**
 * Debug endpoint to check user's GitHub access and organizations
 * GET /api/github/oauth/user-info
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
      select: { githubAccessToken: true, githubUsername: true, githubId: true },
    });

    if (!user?.githubAccessToken) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 400 }
      );
    }

    // Decrypt the access token
    const accessToken = EncryptionService.decrypt(user.githubAccessToken);

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    };

    // Fetch user info
    const userResponse = await fetch('https://api.github.com/user', { headers });
    const userData = await userResponse.json();

    // Fetch organizations
    const orgsResponse = await fetch('https://api.github.com/user/orgs', { headers });  
    const orgsData = await orgsResponse.json();

    // Fetch a few repositories with different affiliations
    const repoParams = new URLSearchParams({
      per_page: '10',
      sort: 'updated',
      direction: 'desc',
      affiliation: 'owner,collaborator,organization_member',
    });
    
    const reposResponse = await fetch(`https://api.github.com/user/repos?${repoParams.toString()}`, { headers });
    const reposData = await reposResponse.json();

    // Check organization memberships and permissions
    const orgDetails = await Promise.all(orgsData.map(async (org: any) => {
      try {
        const membershipResponse = await fetch(
          `https://api.github.com/orgs/${org.login}/memberships/${userData.login}`, 
          { headers }
        );
        const membership = membershipResponse.ok ? await membershipResponse.json() : null;
        
        return {
          login: org.login,
          id: org.id,
          role: membership?.role || 'unknown',
          state: membership?.state || 'unknown',
        };
      } catch (error) {
        return {
          login: org.login,
          id: org.id,
          role: 'error',
          state: 'error',
        };
      }
    }));

    return NextResponse.json({
      user: {
        login: userData.login,
        id: userData.id,
        name: userData.name,
        email: userData.email,
        scopes: userData.scopes || 'Not available',
      },
      organizations: orgDetails,
      repositorySample: reposData.map((repo: any) => ({
        name: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        permissions: repo.permissions,
        ownerType: repo.owner.type,
      })),
      tokenInfo: {
        hasToken: !!user.githubAccessToken,
        githubUsername: user.githubUsername,
        githubId: user.githubId,
      },
      totalReposCount: reposData.length,
    });

  } catch (error) {
    console.error('Error fetching GitHub user info:', error);
    return NextResponse.json(
      { error: "Failed to fetch GitHub user info" },
      { status: 500 }
    );
  }
}

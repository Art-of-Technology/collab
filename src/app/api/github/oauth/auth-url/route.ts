import { NextRequest, NextResponse } from "next/server";
import { getGitHubAuthUrl } from "@/lib/github/oauth-config";

/**
 * Generate GitHub OAuth authorization URL
 * GET /api/github/oauth/auth-url?state=project:xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state') || crypto.randomUUID();

    console.log('Generating GitHub OAuth URL with:', {
      clientId: process.env.GITHUB_CLIENT_ID ? 'Set' : 'Missing',
      nextAuthUrl: process.env.NEXTAUTH_URL,
      state,
    });

    const authUrl = getGitHubAuthUrl(state);

    console.log('Generated OAuth URL:', authUrl);

    return NextResponse.json({
      authUrl,
      state,
    });

  } catch (error) {
    console.error('Error generating GitHub auth URL:', error);
    return NextResponse.json(
      { error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}

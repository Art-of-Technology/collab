import { NextRequest, NextResponse } from "next/server";

/**
 * Debug endpoint to check GitHub OAuth configuration
 * GET /api/github/oauth/debug
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    environment: {
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ? 'Set' : 'Missing',
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? 'Set' : 'Missing',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'Missing',
    },
    config: {
      redirectUri: `${process.env.NEXTAUTH_URL}/api/github/oauth/callback`,
      scopes: ['repo', 'read:user', 'user:email', 'admin:repo_hook'],
    },
    timestamp: new Date().toISOString(),
  });
}

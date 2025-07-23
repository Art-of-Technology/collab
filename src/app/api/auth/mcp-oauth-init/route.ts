import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

// GET /api/auth/mcp-oauth-init - Initiate OAuth flow for MCP authentication
export async function GET(request: NextRequest) {
  try {
    // Generate a unique state parameter for security
    const state = randomBytes(32).toString('hex');
    
    // Store the state temporarily (in a real app, you'd store this in Redis or a database)
    // For now, we'll include it in the callback URL and validate it there
    
    // Build the OAuth authorization URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl = `${baseUrl}/api/auth/mcp-oauth-callback`;
    
    // Google OAuth parameters
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 500 }
      );
    }
    
    const scope = 'openid email profile';
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    
    return NextResponse.json({
      authUrl: authUrl.toString(),
      state,
      instructions: `
1. Open this URL in your browser: ${authUrl.toString()}
2. Sign in with your Google account (the same one you use for Collab)
3. After successful authentication, you'll get a temporary token
4. Copy the token and use the 'login-with-token' tool in your MCP client
      `.trim()
    });
    
  } catch (error) {
    console.error("OAuth initiation error:", error);
    return NextResponse.json(
      { error: "Failed to initiate OAuth flow" },
      { status: 500 }
    );
  }
} 
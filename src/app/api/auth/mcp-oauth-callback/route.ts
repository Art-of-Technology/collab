import { NextRequest, NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}

// GET /api/auth/mcp-oauth-callback - Handle OAuth callback and generate MCP token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return new Response(`
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <h1>Authentication Error</h1>
            <p>Error: ${error}</p>
            <p>Please try again.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    if (!code) {
      return new Response(`
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <h1>Authentication Error</h1>
            <p>No authorization code received.</p>
            <p>Please try again.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    // Exchange code for tokens
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl = `${baseUrl}/api/auth/mcp-oauth-callback`;

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(`
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <h1>Authentication Error</h1>
            <p>Failed to exchange authorization code for tokens.</p>
            <p>Please try again.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
        status: 500
      });
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      return new Response(`
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <h1>Authentication Error</h1>
            <p>Failed to get user information from Google.</p>
            <p>Please try again.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
        status: 500
      });
    }

    const googleUser: GoogleUserInfo = await userInfoResponse.json();

    // Find user in Collab database
    const user = await prisma.user.findUnique({
      where: { email: googleUser.email },
      include: {
        ownedWorkspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        workspaceMemberships: {
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return new Response(`
        <html>
          <head><title>User Not Found</title></head>
          <body>
            <h1>User Not Found</h1>
            <p>No Collab account found for email: ${googleUser.email}</p>
            <p>Please make sure you have a Collab account with this email address.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
        status: 404
      });
    }

    // Generate temporary MCP token (shorter expiry for security)
    const mcpToken = sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        oauth: true, // Mark as OAuth token
      },
      process.env.NEXTAUTH_SECRET!
    );

    // Combine workspaces
    const workspaces = [
      ...user.ownedWorkspaces.map(w => ({ ...w, role: 'OWNER' })),
      ...user.workspaceMemberships.map(wm => ({ ...wm.workspace, role: wm.role })),
    ];

    // Return success page with token
    return new Response(`
      <html>
        <head>
          <title>Collab MCP Authentication Successful</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              max-width: 600px; 
              margin: 2rem auto; 
              padding: 1rem; 
              line-height: 1.6;
            }
            .token-box { 
              background: #f5f5f5; 
              padding: 1rem; 
              border-radius: 8px; 
              border: 1px solid #ddd;
              font-family: monospace;
              word-break: break-all;
              margin: 1rem 0;
            }
            .copy-btn {
              background: #007acc;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 0.5rem;
            }
            .copy-btn:hover {
              background: #005a9e;
            }
            .instructions {
              background: #e8f4f8;
              padding: 1rem;
              border-radius: 8px;
              border-left: 4px solid #007acc;
              margin: 1rem 0;
            }
            .user-info {
              background: #f0f8f0;
              padding: 1rem;
              border-radius: 8px;
              border-left: 4px solid #28a745;
              margin: 1rem 0;
            }
          </style>
        </head>
        <body>
          <h1>🎉 Authentication Successful!</h1>
          
          <div class="user-info">
            <h3>Authenticated as:</h3>
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Workspaces:</strong> ${workspaces.length} workspace(s)</p>
          </div>

          <div class="instructions">
            <h3>📋 Next Steps:</h3>
            <ol>
              <li>Copy the token below</li>
              <li>Go back to your MCP client (Cursor)</li>
              <li>Use the <code>login-with-token</code> tool</li>
              <li>Paste the token when prompted</li>
            </ol>
          </div>

          <h3>🔑 Your Temporary MCP Token:</h3>
          <div class="token-box" id="tokenBox">
            ${mcpToken}
          </div>
          <button class="copy-btn" onclick="copyToken()">📋 Copy Token</button>

          <p><strong>⚠️ Important:</strong> This token expires in 7 days. Keep it secure and don't share it with anyone.</p>

          <script>
            function copyToken() {
              const tokenBox = document.getElementById('tokenBox');
              const textArea = document.createElement('textarea');
              textArea.value = tokenBox.textContent.trim();
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              
              const btn = document.querySelector('.copy-btn');
              const originalText = btn.textContent;
              btn.textContent = '✅ Copied!';
              setTimeout(() => {
                btn.textContent = originalText;
              }, 2000);
            }
          </script>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(`
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <h1>Authentication Error</h1>
          <p>An unexpected error occurred during authentication.</p>
          <p>Please try again.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
} 
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { sign } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

// GET /api/auth/mcp-token - Generate MCP token for logged-in user
export async function GET(request: NextRequest) {
  try {
    // Check if user is logged in via NextAuth session
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated. Please login to Collab first." },
        { status: 401 }
      );
    }

    // Get user details from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
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
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    // Generate MCP token
    const mcpToken = sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        sessionToken: true, // Mark as session-based token
      },
      process.env.NEXTAUTH_SECRET!
    );

    // Combine workspaces
    const workspaces = [
      ...user.ownedWorkspaces.map(w => ({ ...w, role: 'OWNER' })),
      ...user.workspaceMemberships.map(wm => ({ ...wm.workspace, role: wm.role })),
    ];

    return NextResponse.json({
      success: true,
      token: mcpToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaces,
      },
      instructions: `
1. Copy the token below
2. Go to your MCP client (Cursor)
3. Use the 'login-with-token' tool
4. Paste the token when prompted
      `.trim()
    });

  } catch (error) {
    console.error("MCP token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate MCP token" },
      { status: 500 }
    );
  }
} 
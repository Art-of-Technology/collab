import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { validateMCPToken } from "@/lib/mcp-auth";

// GET /api/user/me - Get current user profile
export async function GET(request: Request) {
  try {
    // First try MCP token authentication
    const mcpUser = await validateMCPToken(request as any);
    
    if (mcpUser) {
      // Return user data from MCP token
      return NextResponse.json({
        id: mcpUser.id,
        name: mcpUser.name,
        email: mcpUser.email,
        role: mcpUser.role,
        workspaces: mcpUser.workspaces,
        authMethod: 'mcp'
      });
    }

    // Fall back to NextAuth session authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Find the user by email from session
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        team: true,
        currentFocus: true,
        expertise: true,
        createdAt: true,
        updatedAt: true,
        // Include workspace memberships
        ownedWorkspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
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
                description: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Combine owned and member workspaces
    const workspaces = [
      ...user.ownedWorkspaces.map(w => ({ ...w, role: 'OWNER' })),
      ...user.workspaceMemberships.map(wm => ({ ...wm.workspace, role: wm.role })),
    ];

    const userProfile = {
      ...user,
      workspaces,
      authMethod: 'session',
      // Remove the raw workspace data
      ownedWorkspaces: undefined,
      workspaceMemberships: undefined,
    };

    return NextResponse.json(userProfile);
  } catch (error) {
    console.error("Error getting current user:", error);
    return NextResponse.json(
      { error: "Failed to get user profile" },
      { status: 500 }
    );
  }
} 
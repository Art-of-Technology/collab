import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcrypt";
import { sign } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

// POST /api/auth/mcp-login - Authenticate user for MCP server
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
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
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // For Google OAuth users, they might not have a hashed password
    if (!user.hashedPassword) {
      return NextResponse.json(
        { error: "This account uses Google sign-in. Please use your Google account to authenticate." },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await compare(password, user.hashedPassword);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Generate MCP session token
    const mcpToken = sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
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
    });

  } catch (error) {
    console.error("MCP login error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
} 
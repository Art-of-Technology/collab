import { NextRequest } from "next/server";
import { verify } from "jsonwebtoken";
import { prisma } from "./prisma";

interface MCPTokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

interface MCPUser {
  id: string;
  email: string;
  name: string;
  role: string;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
}

export async function validateMCPToken(request: NextRequest): Promise<MCPUser | null> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return null;
    }

    // Verify JWT token
    let decoded: MCPTokenPayload;
    try {
      decoded = verify(token, process.env.NEXTAUTH_SECRET!) as MCPTokenPayload;
    } catch (error) {
      return null;
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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
      return null;
    }

    // Combine workspaces
    const workspaces = [
      ...user.ownedWorkspaces.map(w => ({ ...w, role: 'OWNER' })),
      ...user.workspaceMemberships.map(wm => ({ ...wm.workspace, role: wm.role })),
    ];

    return {
      id: user.id,
      email: user.email || '',
      name: user.name || '',
      role: user.role,
      workspaces,
    };

  } catch (error) {
    console.error("MCP token validation error:", error);
    return null;
  }
} 
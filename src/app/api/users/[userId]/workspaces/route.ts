import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/users/[userId]/workspaces - Get workspaces for a user
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const _params = await params;
    const { userId } = _params;

    // Check if the requesting user has permission to view this user's workspaces
    // Users can only view their own workspaces unless they are system admins
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true, role: true },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Current user not found" },
        { status: 404 }
      );
    }

    // Allow access if it's the same user or if current user is a system admin
    if (currentUser.id !== userId && currentUser.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json(
        { error: "Forbidden: You can only access your own workspaces" },
        { status: 403 }
      );
    }

    // Get owned workspaces
    const ownedWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Get member workspaces
    const memberWorkspaces = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // Combine and format workspaces
    const workspaces = [
      ...ownedWorkspaces.map(w => ({ ...w, role: 'OWNER' })),
      ...memberWorkspaces.map(wm => ({ ...wm.workspace, role: wm.role })),
    ];

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Error fetching user workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
} 
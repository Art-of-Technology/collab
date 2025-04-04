import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from "@/lib/session";

// GET /api/workspaces/[workspaceId]/members/role - Get current user's role in a workspace
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const _params = await params;
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = _params.workspaceId;

    // Check if user is the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if (workspace.ownerId === user.id) {
      return NextResponse.json({ role: "owner", userId: user.id });
    }

    // Check user's role in the workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspaceId,
      },
    });

    if (!membership) {
      // User is not a member of this workspace
      return NextResponse.json({ role: null, userId: user.id });
    }

    return NextResponse.json({ 
      role: membership.role,
      userId: user.id,
      memberId: membership.id
    });
  } catch (error) {
    console.error("Error fetching user's workspace role:", error);
    return NextResponse.json(
      { error: "Failed to fetch user role" },
      { status: 500 }
    );
  }
} 
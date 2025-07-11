import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from "@/lib/session";

// GET /api/workspaces/[workspaceId]/members - Get all members of a workspace
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

    // Check if user has access to the workspace (member or owner)
    const [isMember, isOwner] = await Promise.all([
      prisma.workspaceMember.findFirst({
        where: {
          userId: user.id,
          workspaceId,
        },
      }),
      prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          ownerId: user.id,
        },
      })
    ]);

    if (!isMember && !isOwner) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get members of the workspace
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true
          },
        },
      },
      orderBy: {
        role: "asc", // Order by role, usually puts admins first
      },
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error("Error fetching workspace members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
} 
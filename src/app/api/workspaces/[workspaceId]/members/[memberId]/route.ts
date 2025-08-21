import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from "@/lib/session";
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

// PATCH /api/workspaces/[workspaceId]/members/[memberId] - Update member status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { workspaceId: string; memberId: string } }
) {
  const _params = await params;
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, memberId } = _params;
    const body = await request.json();
    const { status } = body;

    if (typeof status !== 'boolean') {
      return NextResponse.json({ error: "Status must be a boolean" }, { status: 400 });
    }

    // Resolve workspace slug/ID to actual workspace ID
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Check if user has permission to update member status
    const [isOwner, isAdmin] = await Promise.all([
      prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          ownerId: user.id,
        },
      }),
      prisma.workspaceMember.findFirst({
        where: {
          userId: user.id,
          workspaceId,
          role: 'ADMIN',
          status: true,
        },
      })
    ]);

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Only workspace owners and admins can update member status" }, { status: 403 });
    }

    // Find the member to update
    const member = await prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent deactivating the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (member.userId === workspace?.ownerId) {
      return NextResponse.json({ error: "Cannot deactivate the workspace owner" }, { status: 400 });
    }

    // Update the member status
    const updatedMember = await prisma.workspaceMember.update({
      where: {
        id: memberId,
      },
      data: {
        status,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            useCustomAvatar: true,
            avatarAccessory: true,
            avatarBrows: true,
            avatarEyes: true,
            avatarEyewear: true,
            avatarHair: true,
            avatarMouth: true,
            avatarNose: true,
            avatarSkinTone: true,
          },
        },
      },
    });

    return NextResponse.json(updatedMember);
  } catch (error) {
    console.error("Error updating member status:", error);
    return NextResponse.json(
      { error: "Failed to update member status" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from "@/lib/session";
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { getWorkspaceAuthority, levelOfRole, may, mayActOn } from '@/lib/workspace-authority';

// PATCH /api/workspaces/[workspaceId]/members/[memberId] - Update member status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
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
    const actor = await getWorkspaceAuthority(user.id, workspaceId);
    if (!may(actor, 'members.manage')) {
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

    // An account with no email is an agent token's service account: the Agent tokens page has its own rules for those.
    if (!member.user.email) {
      return NextResponse.json({ error: "Agents are managed on the Agent tokens page" }, { status: 409 });
    }

    // The rank rule, which also keeps the workspace owner's membership on. A platform admin keeps the
    // answer this route gave an Admin before it: anyone but the workspace owner.
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    const target = { userId: member.userId, level: member.userId === workspace?.ownerId ? 'PRIMARY_OWNER' as const : levelOfRole(member.role) };

    if (actor?.platformAdmin ? target.level === 'PRIMARY_OWNER' : !mayActOn(actor, target, { holdsChangeRoles: false })) {
      return NextResponse.json({ error: "You can only switch on or off members below your own level" }, { status: 403 });
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

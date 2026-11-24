import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { Permission, WorkspaceRole, checkUserPermission } from '@/lib/permissions';
import { ensureRolePermissionsForWorkspaceRole } from '@/lib/role-permission-defaults';
import { getWorkspaceAuthority, levelOfRole, mayActOn, rolesMayGrant } from '@/lib/workspace-authority';

// PUT /api/workspaces/[workspaceId]/members/[memberId]/role - Update member role
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _params = await params;
    const { workspaceId, memberId } = _params;
    const body = await request.json();
    const { role } = body;

    if (typeof role !== 'string' || !role.trim() || role in Object.prototype) {
      return NextResponse.json(
        { error: 'Role is required' },
        { status: 400 }
      );
    }

    // Check if it's a built-in role or custom role
    const isBuiltInRole = Object.values(WorkspaceRole).includes(role as WorkspaceRole);
    
    if (!isBuiltInRole) {
      // Check if custom role exists
      const customRole = await prisma.customRole.findFirst({
        where: {
          workspaceId,
          name: role
        }
      });

      if (!customRole) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
    }

    const actor = await getWorkspaceAuthority(session.user.id, workspaceId);
    const holdsChangeRoles = actor?.level === 'STANDARD'
      ? actor.role !== null && !!await prisma.rolePermission.findUnique({
          where: { workspaceId_role_permission: { workspaceId, role: actor.role, permission: Permission.CHANGE_MEMBER_ROLES } },
          select: { id: true },
        })
      : (await checkUserPermission(session.user.id, workspaceId, Permission.CHANGE_MEMBER_ROLES)).hasPermission;

    if (!holdsChangeRoles) {
      return NextResponse.json(
        { error: 'You do not have permission to manage member roles' },
        { status: 403 }
      );
    }

    // Get the workspace member
    const member = await prisma.workspaceMember.findUnique({
      where: { 
        id: memberId,
        workspaceId,
        status: true 
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
    if (member.userId === workspace?.ownerId) {
      return NextResponse.json({ error: "The primary owner's role cannot be changed" }, { status: 403 });
    }

    // The rank rule. A platform admin who is not a member keeps the answer this route gave before it.
    if (actor?.level !== null) {
      const target = { userId: member.userId, level: levelOfRole(member.role) };
      if (member.userId === session.user.id) {
        return NextResponse.json({ error: 'Nobody can change their own role' }, { status: 403 });
      }
      if (!mayActOn(actor, target, { holdsChangeRoles })) {
        return NextResponse.json({ error: 'You can only change the role of members below your own level' }, { status: 403 });
      }
      if (rolesMayGrant(actor, [role], { holdsChangeRoles }).length === 0) {
        const error = levelOfRole(role) === 'OWNER' ? 'Only the primary owner can grant the Owner role' : 'Only an Owner can grant the Admin role';
        return NextResponse.json({ error }, { status: 403 });
      }
    }

    // Update the member's role
    const updatedMember = await prisma.$transaction(async (tx) => {
      const memberUpdated = await tx.workspaceMember.update({
        where: { id: memberId },
        data: { role: role as any, updatedAt: new Date() },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });

      // Ensure role-level permissions exist for this workspace and role
      await ensureRolePermissionsForWorkspaceRole(workspaceId, role);

      return memberUpdated;
    });

    return NextResponse.json({
      success: true,
      member: updatedMember
    });

  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: 'Failed to update member role' },
      { status: 500 }
    );
  }
} 
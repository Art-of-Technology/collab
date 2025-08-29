import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Permission, WorkspaceRole, checkUserPermission } from '@/lib/permissions';
import { ensureRolePermissionsForWorkspaceRole } from '@/lib/role-permission-defaults';

// PUT /api/workspaces/[workspaceId]/members/[memberId]/role - Update member role
export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string; memberId: string } }
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

    if (!role) {
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

    // Check if user has permission to manage member roles
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.CHANGE_MEMBER_ROLES
    );

    if (!hasPermission.hasPermission) {
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

    // Prevent users from changing their own role to something lower
    if (member.userId === session.user.id && role !== WorkspaceRole.OWNER && role !== WorkspaceRole.ADMIN) {
      return NextResponse.json(
        { error: 'You cannot downgrade your own role' },
        { status: 400 }
      );
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
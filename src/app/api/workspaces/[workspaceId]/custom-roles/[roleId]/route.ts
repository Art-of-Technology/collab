import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission as PermissionEnum } from '@/lib/permissions';
import { Permission } from '@prisma/client';

// GET /api/workspaces/[workspaceId]/custom-roles/[roleId] - Get custom role details
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string; roleId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, roleId } = await params;

    // Check if user is a member of the workspace
    const member = await prisma.workspaceMember.findUnique({
      where: {
        status: true,
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId
        }
      }
    });

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Get the custom role
    const customRole = await prisma.customRole.findFirst({
      where: {
        id: roleId,
        workspaceId
      }
    });

    if (!customRole) {
      return NextResponse.json({ error: 'Custom role not found' }, { status: 404 });
    }

    // Get permissions for this role
    const permissions = await prisma.rolePermission.findMany({
      where: {
        workspaceId,
        role: customRole.name
      },
      select: {
        permission: true
      }
    });

    return NextResponse.json({
      ...customRole,
      permissions: permissions.map(p => p.permission)
    });

  } catch (error) {
    console.error('Error fetching custom role:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom role' },
      { status: 500 }
    );
  }
}

// PUT /api/workspaces/[workspaceId]/custom-roles/[roleId] - Update custom role
export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string; roleId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, roleId } = await params;
    const body = await request.json();
    const { name, description, color, permissions } = body;

    // Check if user has permission to manage workspace permissions
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      PermissionEnum.MANAGE_WORKSPACE_PERMISSIONS
    );

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to update custom roles' },
        { status: 403 }
      );
    }

    // Get the existing custom role
    const existingRole = await prisma.customRole.findFirst({
      where: {
        id: roleId,
        workspaceId
      }
    });

    if (!existingRole) {
      return NextResponse.json({ error: 'Custom role not found' }, { status: 404 });
    }

    // If name is being changed, check for duplicates
    if (name && name !== existingRole.name) {
      const duplicateRole = await prisma.customRole.findFirst({
        where: {
          workspaceId,
          name: {
            equals: name,
            mode: 'insensitive'
          },
          NOT: {
            id: roleId
          }
        }
      });

      if (duplicateRole) {
        return NextResponse.json(
          { error: 'A role with this name already exists' },
          { status: 400 }
        );
      }
    }

    // Start a transaction to update role and permissions
    const result = await prisma.$transaction(async (tx) => {
      // Update the custom role
      const updatedRole = await tx.customRole.update({
        where: { id: roleId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(color && { color })
        }
      });

      // If permissions are provided, update them
      if (Array.isArray(permissions)) {
        // Delete existing permissions
        await tx.rolePermission.deleteMany({
          where: {
            workspaceId,
            role: existingRole.name
          }
        });

        // Create new permissions
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission: string) => ({
              workspaceId,
              role: updatedRole.name,
              permission: permission as Permission
            }))
          });
        }
      }

      // If role name changed, update WorkspaceMember records
      if (name && name !== existingRole.name) {
        await tx.workspaceMember.updateMany({
          where: {
            workspaceId,
            role: existingRole.name
          },
          data: {
            role: name
          }
        });
      }

      return updatedRole;
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error updating custom role:', error);
    return NextResponse.json(
      { error: 'Failed to update custom role' },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId]/custom-roles/[roleId] - Delete custom role
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string; roleId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, roleId } = await params;

    // Check if user has permission to manage workspace permissions
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      PermissionEnum.MANAGE_WORKSPACE_PERMISSIONS
    );

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to delete custom roles' },
        { status: 403 }
      );
    }

    // Get the custom role
    const customRole = await prisma.customRole.findFirst({
      where: {
        id: roleId,
        workspaceId
      }
    });

    if (!customRole) {
      return NextResponse.json({ error: 'Custom role not found' }, { status: 404 });
    }

    // Check if any members have this role
    const membersWithRole = await prisma.workspaceMember.count({
      where: {
        workspaceId,
        role: customRole.name
      }
    });

    if (membersWithRole > 0) {
      return NextResponse.json(
        { error: `Cannot delete role. ${membersWithRole} member(s) are assigned to this role.` },
        { status: 400 }
      );
    }

    // Delete the role and its permissions in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete role permissions
      await tx.rolePermission.deleteMany({
        where: {
          workspaceId,
          role: customRole.name
        }
      });

      // Delete the custom role
      await tx.customRole.delete({
        where: { id: roleId }
      });
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting custom role:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom role' },
      { status: 500 }
    );
  }
} 
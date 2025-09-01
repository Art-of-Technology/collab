import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission as PermissionEnum } from '@/lib/permissions';
import { Permission } from '@prisma/client';

// GET /api/workspaces/[workspaceId]/custom-roles - List custom roles
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;

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

    // Get all custom roles for the workspace
    const customRoles = await prisma.customRole.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' }
    });

    // Get permissions for each custom role
    const customRolesWithPermissions = await Promise.all(
      customRoles.map(async (role) => {
        const permissions = await prisma.rolePermission.findMany({
          where: {
            workspaceId,
            role: role.name
          },
          select: {
            permission: true
          }
        });

        return {
          ...role,
          permissions: permissions.map(p => p.permission)
        };
      })
    );

    return NextResponse.json(customRolesWithPermissions);

  } catch (error) {
    console.error('Error fetching custom roles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom roles' },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/custom-roles - Create custom role
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    const body = await request.json();
    const { name, description, color, permissions } = body;

    if (!name || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'Name and permissions array are required' },
        { status: 400 }
      );
    }

    // Check if user has permission to manage workspace permissions
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      PermissionEnum.MANAGE_WORKSPACE_PERMISSIONS
    );

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to create custom roles' },
        { status: 403 }
      );
    }

    // Check if role name already exists in this workspace
    const existingRole = await prisma.customRole.findFirst({
      where: {
        workspaceId,
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });

    if (existingRole) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 400 }
      );
    }

    // Create the custom role
    const customRole = await prisma.customRole.create({
      data: {
        name,
        description,
        color: color || '#6366F1',
        workspaceId
      }
    });

    // Create role permissions
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission: string) => ({
          workspaceId,
          role: customRole.name,
          permission: permission as Permission
        }))
      });
    }

    // Return the custom role with permissions
    return NextResponse.json({
      ...customRole,
      permissions
    });

  } catch (error) {
    console.error('Error creating custom role:', error);
    return NextResponse.json(
      { error: 'Failed to create custom role' },
      { status: 500 }
    );
  }
} 
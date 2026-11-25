import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { WorkspaceRole } from '@/lib/permissions';
import { getWorkspaceAuthority, may } from '@/lib/workspace-authority';
import { Permission } from '@prisma/client';

// GET /api/workspaces/[workspaceId]/custom-roles - List custom roles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;

    // Every active member and the owner may list them; a platform admin who is not a member may not, as before.
    const authority = await getWorkspaceAuthority(session.user.id, workspaceId);
    if (!authority?.level) {
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
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    const body = await request.json();
    const { name, description, color, permissions } = body;

    if (typeof name !== 'string' || !name.trim() ||
        Object.values(WorkspaceRole).some(role => role === name.trim().toUpperCase()) ||
        name in Object.prototype ||
        !Array.isArray(permissions) ||
        !permissions.every(value => Object.values(Permission).includes(value))) {
      return NextResponse.json(
        { error: 'Name and permissions array are required' },
        { status: 400 }
      );
    }

    // Owners only. A platform admin who is not a member keeps the answer this route gave before.
    const authority = await getWorkspaceAuthority(session.user.id, workspaceId);
    if (authority?.level !== null && !may(authority, 'roles.edit')) {
      return NextResponse.json({ error: 'Only Owners can manage roles and permissions' }, { status: 403 });
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

    const customRole = await prisma.$transaction(async (tx) => {
      const created = await tx.customRole.create({
        data: {
          name,
          description,
          color: color || '#6366F1',
          workspaceId
        }
      });

      // Create role permissions
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission: string) => ({
            workspaceId,
            role: created.name,
            permission: permission as Permission
          }))
        });
      }
      return created;
    });

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
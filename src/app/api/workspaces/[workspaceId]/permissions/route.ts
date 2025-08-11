import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Permission, WorkspaceRole, checkUserPermission } from '@/lib/permissions';

// GET /api/workspaces/[workspaceId]/permissions - Get permissions for a workspace or user
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const _params = await params;
    const { workspaceId } = _params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // If requesting specific user permissions (for permission hook)
    if (userId) {
      const { getUserPermissions, getUserWorkspaceRole } = await import('@/lib/permissions');

      const userPermissions = await getUserPermissions(userId, workspaceId);
      const userRole = await getUserWorkspaceRole(userId, workspaceId);

      if (!userRole) {
        return NextResponse.json(
          { error: 'User not found in workspace' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      return NextResponse.json(
        {
          permissions: userPermissions,
          role: userRole,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Otherwise, get all workspace permissions (for management)
    // Check if user has permission to manage workspace permissions
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.MANAGE_WORKSPACE_PERMISSIONS
    );

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to view workspace permissions' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Get all role permissions for the workspace
    const rolePermissions = await (prisma as any).rolePermission.findMany({
      where: { workspaceId },
      orderBy: [
        { role: 'asc' },
        { permission: 'asc' }
      ]
    });

    // Group permissions by role
    const permissionsByRole: Record<string, any[]> = {};

    for (const rolePermission of rolePermissions) {
      if (!permissionsByRole[rolePermission.role]) {
        permissionsByRole[rolePermission.role] = [];
      }
      permissionsByRole[rolePermission.role].push(rolePermission);
    }

    return NextResponse.json(
      {
        permissions: rolePermissions,
        permissionsByRole,
        roles: Object.values(WorkspaceRole),
        availablePermissions: Object.values(Permission),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } catch (error) {
    console.error('Error fetching workspace permissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// PUT /api/workspaces/[workspaceId]/permissions - Update role permissions
export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _params = await params;
    const { workspaceId } = _params;
    const body = await request.json();
    const { role, permission, enabled } = body;

    if (!role || !permission || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Role, permission, and enabled status are required' },
        { status: 400 }
      );
    }

    // Check if user has permission to manage workspace permissions
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.MANAGE_WORKSPACE_PERMISSIONS
    );

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to manage workspace permissions' },
        { status: 403 }
      );
    }

    // Prevent users from removing their own MANAGE_WORKSPACE_PERMISSIONS permission
    if (
      role === hasPermission.userRole &&
      permission === Permission.MANAGE_WORKSPACE_PERMISSIONS &&
      !enabled
    ) {
      return NextResponse.json(
        { error: 'You cannot remove your own permission management access' },
        { status: 400 }
      );
    }

    // Handle permission enable/disable
    if (enabled) {
      // Create the permission if enabling
      await (prisma as any).rolePermission.upsert({
        where: {
          workspaceId_role_permission: {
            workspaceId,
            role,
            permission
          }
        },
        update: {
          updatedAt: new Date()
        },
        create: {
          workspaceId,
          role,
          permission
        }
      });
    } else {
      // Delete the permission if disabling
      await (prisma as any).rolePermission.deleteMany({
        where: {
          workspaceId,
          role,
          permission
        }
      });
    }

    return NextResponse.json({
      success: true,
      enabled
    });

  } catch (error) {
    console.error('Error updating workspace permission:', error);
    return NextResponse.json(
      { error: 'Failed to update permission' },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/permissions/reset - Reset permissions to defaults
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _params = await params;
    const { workspaceId } = _params;
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json(
        { error: 'Role is required' },
        { status: 400 }
      );
    }

    // Check if user has permission to manage workspace permissions
    const hasPermission = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.MANAGE_WORKSPACE_PERMISSIONS
    );

    if (!hasPermission.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to manage workspace permissions' },
        { status: 403 }
      );
    }

    // Import the seed function
    const { seedDefaultPermissions } = await import('@/../../prisma/scripts/seed-default-permissions');

    // Delete existing permissions for the role
    await (prisma as any).rolePermission.deleteMany({
      where: {
        workspaceId,
        role
      }
    });

    // Reseed default permissions for this workspace
    await seedDefaultPermissions();

    return NextResponse.json({
      success: true,
      message: `Permissions for ${role} role have been reset to defaults`
    });

  } catch (error) {
    console.error('Error resetting workspace permissions:', error);
    return NextResponse.json(
      { error: 'Failed to reset permissions' },
      { status: 500 }
    );
  }
} 
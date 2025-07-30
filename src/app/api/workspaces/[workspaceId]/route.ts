import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// GET /api/workspaces/[workspaceId] - Get workspace details
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const _params = await params;
    const { workspaceId } = _params;

    // Try to find by slug first, then by ID for backward compatibility
    let workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
              }
            }
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          }
        }
      }
    });

    // If not found by slug, try by ID for backward compatibility
    if (!workspace) {
      workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  role: true,
                }
              }
            }
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
            }
          }
        }
      });
    }

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Check if user is a member or owner
    const isMember = workspace.members.some(member => member.userId === session.user.id) || 
                    workspace.ownerId === session.user.id;

    if (!isMember) {
      return NextResponse.json(
        { error: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

// PATCH /api/workspaces/[workspaceId] - Update workspace
export async function PATCH(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const _params = await params;
    const { workspaceId } = _params;
    const body = await request.json();
    const { name, description, logoUrl } = body;

    // Check if workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: {
            userId: session.user.id,
            role: { in: ['owner', 'admin'] }
          }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Check if user is owner, admin in the workspace, or a system admin
    const isOwnerOrAdmin = 
      workspace.ownerId === session.user.id || 
      workspace.members.length > 0 || 
      session.user.role === 'admin';

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to update this workspace' },
        { status: 403 }
      );
    }

    // Update workspace
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: name || undefined,
        description: description !== undefined ? description : undefined,
        logoUrl: logoUrl !== undefined ? logoUrl : undefined,
      }
    });

    return NextResponse.json(updatedWorkspace);
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json(
      { error: 'Failed to update workspace' },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId] - Delete workspace
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const _params = await params;
    const { workspaceId } = _params;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Allow owner or system admin to delete workspace
    if (workspace.ownerId !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only the workspace owner or system admin can delete it' },
        { status: 403 }
      );
    }

    // Delete workspace and all related data
    await prisma.workspace.delete({
      where: { id: workspaceId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return NextResponse.json(
      { error: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
} 
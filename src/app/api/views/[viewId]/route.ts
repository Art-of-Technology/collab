import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { viewId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { viewId } = await params;

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch view with access control
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { visibility: 'WORKSPACE' },
          { visibility: 'SHARED', sharedWith: { has: user.id } },
          { visibility: 'PERSONAL', ownerId: user.id }
        ],
        workspace: {
          members: {
            some: {
              user: {
                email: session.user.email
              }
            }
          }
        }
      },
      include: {
        _count: {
          select: {
            issues: true
          }
        },
        projects: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    // Transform the data for the frontend
    const transformedView = {
      id: view.id,
      name: view.name,
      description: view.description,
      type: view.type,
      displayType: view.displayType,
      visibility: view.visibility,
      color: view.color,
      issueCount: view._count.issues,
      filters: view.filters,
      projectIds: view.projects.map(p => p.id),
      isDefault: view.isDefault,
      isFavorite: view.isFavorite,
      createdBy: view.createdBy,
      sharedWith: view.sharedWith,
      workspace: view.workspace,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt
    };

    return NextResponse.json({ view: transformedView });

  } catch (error) {
    console.error('Error fetching view:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { viewId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { viewId } = params;
    const body = await request.json();

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user can edit this view (only owner can edit personal views)
    const existingView = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { visibility: 'PERSONAL', ownerId: user.id },
          { visibility: 'WORKSPACE' }, // TODO: Add proper workspace admin check
          { visibility: 'SHARED', ownerId: user.id }
        ],
        workspace: {
          members: {
            some: {
              user: {
                email: session.user.email
              }
            }
          }
        }
      }
    });

    if (!existingView) {
      return NextResponse.json({ error: 'View not found or no permission to edit' }, { status: 404 });
    }

    // Validate fields that can be updated
    const { 
      name, 
      description, 
      displayType, 
      visibility,
      color,
      filters,
      projectIds,
      sharedWith
    } = body;

    // Prepare update data
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (filters !== undefined) updateData.filters = filters;
    if (sharedWith !== undefined) updateData.sharedWith = sharedWith;

    // Validate display type if provided
    if (displayType !== undefined) {
      const validDisplayTypes = ['KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'BOARD'];
      if (!validDisplayTypes.includes(displayType)) {
        return NextResponse.json(
          { error: 'Invalid display type' }, 
          { status: 400 }
        );
      }
      updateData.displayType = displayType;
    }

    // Validate visibility if provided
    if (visibility !== undefined) {
      const validVisibilities = ['PERSONAL', 'WORKSPACE', 'SHARED'];
      if (!validVisibilities.includes(visibility)) {
        return NextResponse.json(
          { error: 'Invalid visibility' }, 
          { status: 400 }
        );
      }
      updateData.visibility = visibility;
    }

    // Handle project connections
    if (projectIds !== undefined) {
      updateData.projects = {
        set: [], // Clear existing connections
        connect: projectIds.map((id: string) => ({ id }))
      };
    }

    // Update the view
    const updatedView = await prisma.view.update({
      where: { id: viewId },
      data: updateData,
      include: {
        _count: {
          select: {
            issues: true
          }
        },
        projects: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    // Transform the data for the frontend
    const transformedView = {
      id: updatedView.id,
      name: updatedView.name,
      description: updatedView.description,
      type: updatedView.type,
      displayType: updatedView.displayType,
      visibility: updatedView.visibility,
      color: updatedView.color,
      issueCount: updatedView._count.issues,
      filters: updatedView.filters,
      projectIds: updatedView.projects.map(p => p.id),
      isDefault: updatedView.isDefault,
      isFavorite: updatedView.isFavorite,
      createdBy: updatedView.createdBy,
      sharedWith: updatedView.sharedWith,
      createdAt: updatedView.createdAt,
      updatedAt: updatedView.updatedAt
    };

    return NextResponse.json({ view: transformedView });

  } catch (error) {
    console.error('Error updating view:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { viewId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { viewId } = params;

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user can delete this view (only owner can delete, and can't delete system views)
    const existingView = await prisma.view.findFirst({
      where: {
        id: viewId,
        type: { not: 'SYSTEM' }, // Can't delete system views
        ownerId: user.id, // Only creator can delete
        workspace: {
          members: {
            some: {
              user: {
                email: session.user.email
              }
            }
          }
        }
      }
    });

    if (!existingView) {
      return NextResponse.json({ 
        error: 'View not found or no permission to delete' 
      }, { status: 404 });
    }

    // Delete the view
    await prisma.view.delete({
      where: { id: viewId }
    });

    return NextResponse.json({ message: 'View deleted successfully' });

  } catch (error) {
    console.error('Error deleting view:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
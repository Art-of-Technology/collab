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

    const { viewId: viewSlug } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch view with access control using slug
    const view = await prisma.view.findFirst({
      where: {
        slug: viewSlug,
        workspaceId: workspaceId,
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
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true
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
      slug: view.slug,
      name: view.name,
      description: view.description,
      displayType: view.displayType,
      visibility: view.visibility,
      color: view.color,
      filters: view.filters,
      sorting: view.sorting,
      grouping: view.grouping,
      fields: view.fields,
      layout: view.layout,
      projectIds: view.projectIds,
      workspaceIds: view.workspaceIds,
      isDefault: view.isDefault,
      isFavorite: view.isFavorite,
      sharedWith: view.sharedWith,
      workspace: view.workspace,
      owner: view.owner,
      lastAccessedAt: view.lastAccessedAt,
      accessCount: view.accessCount,
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

    const { viewId: viewSlug } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const body = await request.json();

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

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
        slug: viewSlug,
        workspaceId: workspaceId,
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
      sorting,
      grouping,
      fields,
      layout,
      projectIds,
      workspaceIds,
      sharedWith
    } = body;

    // Prepare update data
    const updateData: any = {};
    
    if (name !== undefined) {
      updateData.name = name;
      // TODO: Regenerate slug if name changes (would need generateUniqueViewSlug function)
    }
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (filters !== undefined) updateData.filters = filters;
    if (sorting !== undefined) updateData.sorting = sorting;
    if (grouping !== undefined) updateData.grouping = grouping;
    if (fields !== undefined) updateData.fields = fields;
    if (layout !== undefined) updateData.layout = layout;
    if (projectIds !== undefined) updateData.projectIds = projectIds;
    if (workspaceIds !== undefined) updateData.workspaceIds = workspaceIds;
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

    // Update the view
    const updatedView = await prisma.view.update({
      where: { id: existingView.id },
      data: updateData,
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Transform the data for the frontend
    const transformedView = {
      id: updatedView.id,
      slug: updatedView.slug,
      name: updatedView.name,
      description: updatedView.description,
      displayType: updatedView.displayType,
      visibility: updatedView.visibility,
      color: updatedView.color,
      filters: updatedView.filters,
      sorting: updatedView.sorting,
      grouping: updatedView.grouping,
      fields: updatedView.fields,
      layout: updatedView.layout,
      projectIds: updatedView.projectIds,
      workspaceIds: updatedView.workspaceIds,
      isDefault: updatedView.isDefault,
      isFavorite: updatedView.isFavorite,
      sharedWith: updatedView.sharedWith,
      workspace: updatedView.workspace,
      owner: updatedView.owner,
      lastAccessedAt: updatedView.lastAccessedAt,
      accessCount: updatedView.accessCount,
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

    const { viewId: viewSlug } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user can delete this view (only owner can delete)
    const existingView = await prisma.view.findFirst({
      where: {
        slug: viewSlug,
        workspaceId: workspaceId,
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
      where: { id: existingView.id }
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
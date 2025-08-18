import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string; viewId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, viewId } = await params;
    const body = await request.json();
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: {
          some: {
            user: {
              email: session.user.email
            }
          }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Find the view and verify user can edit it
    const existingView = await prisma.view.findFirst({
      where: {
        id: viewId,
        workspaceId,
        OR: [
          { ownerId: user.id }, // User owns the view
          { 
            visibility: 'WORKSPACE', // Workspace view (assuming all workspace members can edit)
            // You might want to add additional permission checks here
          }
        ]
      }
    });

    if (!existingView) {
      return NextResponse.json({ error: 'View not found or insufficient permissions' }, { status: 404 });
    }

    // Extract update fields from body
    const { 
      name,
      displayType,
      filters,
      sorting,
      grouping,
      fields,
      visibility,
      ownerId
    } = body;

    // Validate visibility if provided
    if (visibility !== undefined) {
      const validVisibilities = ['PERSONAL', 'WORKSPACE', 'SHARED'];
      if (!validVisibilities.includes(visibility)) {
        return NextResponse.json(
          { error: 'Invalid visibility' }, 
          { status: 400 }
        );
      }
    }

    // Validate ownerId if provided
    if (ownerId !== undefined) {
      const newOwner = await prisma.user.findFirst({
        where: {
          id: ownerId,
          workspaceMemberships: {
            some: {
              workspaceId
            }
          }
        }
      });

      if (!newOwner) {
        return NextResponse.json(
          { error: 'New owner must be a member of the workspace' }, 
          { status: 400 }
        );
      }
    }

    // Validate name if provided
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { error: 'View name cannot be empty' }, 
          { status: 400 }
        );
      }
      
      if (name.length > 100) {
        return NextResponse.json(
          { error: 'View name cannot exceed 100 characters' }, 
          { status: 400 }
        );
      }
    }

    // Update the view with only the provided fields
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name.trim();
    if (displayType !== undefined) updateData.displayType = displayType;
    if (filters !== undefined) updateData.filters = filters;
    if (sorting !== undefined) updateData.sorting = sorting;
    if (grouping !== undefined) updateData.grouping = grouping;
    if (fields !== undefined) updateData.fields = fields;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (ownerId !== undefined) updateData.ownerId = ownerId;

    const updatedView = await prisma.view.update({
      where: { id: viewId },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
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
      color: updatedView.color || '#3b82f6',
      issueCount: 0, // TODO: Calculate actual issue count
      filters: updatedView.filters,
      sorting: updatedView.sorting,
      grouping: updatedView.grouping,
      fields: updatedView.fields,
      layout: updatedView.layout,
      projectIds: updatedView.projectIds,
      workspaceIds: updatedView.workspaceIds,
      isDefault: updatedView.isDefault,
      isFavorite: updatedView.isFavorite,
      ownerId: updatedView.ownerId,
      owner: updatedView.owner,
      createdBy: updatedView.ownerId,
      sharedWith: updatedView.sharedWith,
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
  { params }: { params: { workspaceId: string; viewId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, viewId } = await params;
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: {
          some: {
            user: {
              email: session.user.email
            }
          }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Find the view and verify user can delete it
    const existingView = await prisma.view.findFirst({
      where: {
        id: viewId,
        workspaceId,
        ownerId: user.id // Only view owner can delete
      }
    });

    if (!existingView) {
      return NextResponse.json({ error: 'View not found or insufficient permissions' }, { status: 404 });
    }

    // Prevent deletion of default views
    if (existingView.isDefault) {
      return NextResponse.json({ error: 'Cannot delete default view' }, { status: 400 });
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

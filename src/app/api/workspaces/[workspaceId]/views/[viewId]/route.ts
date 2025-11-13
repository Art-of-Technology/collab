import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const paramsSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId is required'),
  viewId: z.string().min(1, 'viewId is required')
});

const updateViewSchema = z.strictObject({
  name: z.string().min(1, 'View name cannot be empty').max(100, 'View name cannot exceed 100 characters').optional().transform(val => val?.trim()),
  displayType: z.enum(['KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'BOARD']).optional(),
  filters: z.any().optional(),
  sorting: z.any().optional(),
  grouping: z.any().optional(),
  fields: z.any().optional(),
  visibility: z.enum(['PERSONAL', 'WORKSPACE', 'SHARED']).optional(),
  ownerId: z.string().min(1).optional(),
  projectIds: z.array(z.string()).optional(),
  layout: z.any().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string; viewId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: 'Invalid URL parameters',
          details: parsedParams.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }
    const { workspaceId, viewId } = parsedParams.data;

    const rawBody = await request.json();
    const parsedBody = updateViewSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsedBody.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }
    const body = parsedBody.data;
    
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
      ownerId,
      layout,
      projectIds,
    } = body;


    // Validate ownerId if provided
    if (body.ownerId !== undefined) {
      const newOwner = await prisma.user.findFirst({
        where: {
          id: body.ownerId,
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
    // Update the view with only the provided fields
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (displayType !== undefined) updateData.displayType = displayType;
    if (filters !== undefined) updateData.filters = filters;
    if (sorting !== undefined) updateData.sorting = sorting;
    if (grouping !== undefined) updateData.grouping = grouping;
    if (fields !== undefined) updateData.fields = fields;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (ownerId !== undefined) updateData.ownerId = ownerId;
    if (layout !== undefined) updateData.layout = layout;
    if (projectIds !== undefined) updateData.projectIds = projectIds;
    
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
      ...updatedView,
      color: updatedView.color || '#3b82f6',
      issueCount: 0 // TODO: Calculate actual issue count
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

    const resolvedParams = await params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: 'Invalid URL parameters',
          details: parsedParams.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }
    const { workspaceId, viewId } = parsedParams.data;
    
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

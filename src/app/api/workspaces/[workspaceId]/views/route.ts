import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateUniqueViewSlug } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    
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

    // Get user for filtering personal views
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch views that the user can access
    const views = await prisma.view.findMany({
      where: {
        workspaceId,
        OR: [
          { visibility: 'WORKSPACE' },
          { visibility: 'SHARED', sharedWith: { has: user.id } },
          { visibility: 'PERSONAL', ownerId: user.id }
        ]
      },
      orderBy: [
        { isDefault: 'desc' }, // Default views first
        { updatedAt: 'desc' }
      ]
    });

    // Transform the data for the frontend
    const transformedViews = views.map(view => ({
      id: view.id,
      slug: view.slug,
      name: view.name,
      description: view.description,
      displayType: view.displayType,
      visibility: view.visibility,
      color: view.color || '#3b82f6',
      issueCount: 0, // TODO: Calculate actual issue count
      filters: view.filters,
      sorting: view.sorting,
      grouping: view.grouping,
      fields: view.fields,
      layout: view.layout,
      projectIds: view.projectIds,
      workspaceIds: view.workspaceIds,
      isDefault: view.isDefault,
      isFavorite: view.isFavorite,
      ownerId: view.ownerId,
      sharedWith: view.sharedWith,
      lastAccessedAt: view.lastAccessedAt,
      accessCount: view.accessCount,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt
    }));

    return NextResponse.json({ views: transformedViews });

  } catch (error) {
    console.error('Error fetching views:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    const body = await request.json();
    
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

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate required fields
    const { 
      name, 
      description, 
      displayType, 
      visibility = 'PERSONAL',
      color,
      filters = {},
      sorting = { field: 'updatedAt', direction: 'desc' },
      grouping = { field: 'status' },
      projectIds = [],
      sharedWith = []
    } = body;

    if (!name || !displayType) {
      return NextResponse.json(
        { error: 'Name and display type are required' }, 
        { status: 400 }
      );
    }

    // Validate display type
    const validDisplayTypes = ['KANBAN', 'LIST', 'TABLE', 'CALENDAR', 'TIMELINE', 'GANTT', 'BOARD'];
    if (!validDisplayTypes.includes(displayType)) {
      return NextResponse.json(
        { error: 'Invalid display type' }, 
        { status: 400 }
      );
    }

    // Validate visibility
    const validVisibilities = ['PERSONAL', 'WORKSPACE', 'SHARED'];
    if (!validVisibilities.includes(visibility)) {
      return NextResponse.json(
        { error: 'Invalid visibility' }, 
        { status: 400 }
      );
    }

    // Generate unique slug for the view
    const slugChecker = async (slug: string, workspaceId: string) => {
      const existingView = await prisma.view.findFirst({
        where: { slug, workspaceId }
      });
      return !!existingView;
    };

    const slug = await generateUniqueViewSlug(name, workspaceId, slugChecker);

    // Create the view
    const view = await prisma.view.create({
      data: {
        name,
        slug,
        description,
        displayType,
        visibility,
        color: color || '#3b82f6',
        filters,
        sorting,
        grouping,
        fields: ['title', 'status', 'priority', 'assignee', 'dueDate'],
        layout: {
          showSubtasks: true,
          showLabels: true,
          showAssigneeAvatars: true
        },
        projectIds: projectIds,
        workspaceIds: [workspaceId],
        sharedWith: visibility === 'SHARED' ? sharedWith : [],
        isDefault: false,
        isFavorite: false,
        workspaceId,
        ownerId: user.id
      }
    });

    // Transform the data for the frontend
    const transformedView = {
      id: view.id,
      slug: view.slug,
      name: view.name,
      description: view.description,
      displayType: view.displayType,
      visibility: view.visibility,
      color: view.color || '#3b82f6',
      issueCount: 0, // TODO: Calculate actual issue count
      filters: view.filters,
      sorting: view.sorting,
      grouping: view.grouping,
      fields: view.fields,
      layout: view.layout,
      projectIds: view.projectIds,
      workspaceIds: view.workspaceIds,
      isDefault: view.isDefault,
      isFavorite: view.isFavorite,
      ownerId: view.ownerId,
      sharedWith: view.sharedWith,
      lastAccessedAt: view.lastAccessedAt,
      accessCount: view.accessCount,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt
    };

    return NextResponse.json({ view: transformedView }, { status: 201 });

  } catch (error) {
    console.error('Error creating view:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
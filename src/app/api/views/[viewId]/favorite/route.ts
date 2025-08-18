import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
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

    // Check if user has access to this view
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
      }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    // Toggle favorite status
    const updatedView = await prisma.view.update({
      where: { id: view.id },
      data: {
        isFavorite: !view.isFavorite
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

    return NextResponse.json({ 
      view: transformedView,
      message: `View ${updatedView.isFavorite ? 'favorited' : 'unfavorited'} successfully`
    });

  } catch (error) {
    console.error('Error toggling view favorite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
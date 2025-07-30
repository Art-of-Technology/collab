import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: { viewId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
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

    // Check if user has access to this view
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { visibility: 'WORKSPACE' },
          { visibility: 'SHARED', sharedWith: { has: user.id } },
          { visibility: 'PERSONAL', createdBy: user.id }
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
      where: { id: viewId },
      data: {
        isFavorite: !view.isFavorite
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
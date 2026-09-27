import { viewReadAccessWhere } from '@/lib/view-access';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { viewId } = await params;

    // Resolve the current session subject by immutable ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if view exists and user has access to it
    const view = await prisma.view.findFirst({
      where: { id: viewId, ...viewReadAccessWhere(user.id) }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found or access denied' }, { status: 404 });
    }

    // Check if already favorited
    const existingFavorite = await prisma.viewFavorite.findUnique({
      where: { viewId_userId: { viewId, userId: user.id }, view: { ...viewReadAccessWhere(user.id) } }
    });

    let isFavorite = false;

    if (existingFavorite) {
      // Remove from favorites
      await prisma.viewFavorite.delete({
        where: { id: existingFavorite.id, userId: user.id, view: { ...viewReadAccessWhere(user.id) } }
      });
      isFavorite = false;
    } else {
      // Add to favorites
      await prisma.viewFavorite.create({
        data: {
          view: { connect: { id: viewId, ...viewReadAccessWhere(user.id) } },
          user: { connect: { id: user.id } }
        }
      });
      isFavorite = true;
    }

    return NextResponse.json({
      success: true,
      isFavorite
    });
  } catch (error) {
    console.error('Error toggling view favorite:', error);
    return NextResponse.json(
      { error: 'Failed to toggle view favorite' },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
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

    // Check if view exists and user has access to it
    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { visibility: 'WORKSPACE' },
          { ownerId: user.id },
          { sharedWith: { has: user.id } }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found or access denied' }, { status: 404 });
    }

    // Check if already favorited
    const existingFavorite = await prisma.viewFavorite.findUnique({
      where: {
        viewId_userId: {
          viewId: viewId,
          userId: user.id
        }
      }
    });

    let isFavorite = false;

    if (existingFavorite) {
      // Remove from favorites
      await prisma.viewFavorite.delete({
        where: {
          id: existingFavorite.id
        }
      });
      isFavorite = false;
    } else {
      // Add to favorites
      await prisma.viewFavorite.create({
        data: {
          viewId: viewId,
          userId: user.id
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
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// GET /api/workspaces/invitations - Get all pending invitations for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.email) {
      return NextResponse.json(
        { error: 'Unauthorized or missing email' },
        { status: 401 }
      );
    }

    // Get all pending invitations for the user's email
    const pendingInvitations = await prisma.workspaceInvitation.findMany({
      where: {
        email: session.user.email,
        status: 'pending',
        expiresAt: {
          gte: new Date()
        }
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            description: true
          }
        },
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(pendingInvitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
} 
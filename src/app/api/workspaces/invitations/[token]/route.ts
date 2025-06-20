import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// GET /api/workspaces/invitations/[token] - Get invitation details
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const _params = await params;
    const { token } = _params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: true,
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    if (invitation.status !== 'pending' || new Date() > invitation.expiresAt) {
      return NextResponse.json(
        { error: 'This invitation has expired or already been used' },
        { status: 400 }
      );
    }

    return NextResponse.json(invitation);
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitation' },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/invitations/[token] - Accept an invitation
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to accept the invitation.' },
        { status: 401 }
      );
    }

    const _params = await params;
    const { token } = _params;

    // Find the invitation
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: true }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    if (invitation.status !== 'pending' || new Date() > invitation.expiresAt) {
      return NextResponse.json(
        { error: 'This invitation has expired or already been used' },
        { status: 400 }
      );
    }

    // Check if the invitation email matches the user's email
    if (invitation.email !== session.user.email) {
      return NextResponse.json(
        { error: 'This invitation was sent to a different email address' },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const existingMembership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId: invitation.workspaceId
      }
    });

    if (existingMembership) {
      // Update invitation status to accepted
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' }
      });

      return NextResponse.json(
        { message: 'You are already a member of this workspace' },
        { status: 200 }
      );
    }

    // Create a new membership and update invitation status
    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: {
          userId: session.user.id,
          workspaceId: invitation.workspaceId,
          role: 'MEMBER'
        }
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: `You've successfully joined ${invitation.workspace.name}!`,
      workspaceId: invitation.workspaceId
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
} 
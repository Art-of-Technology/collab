import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { sendWorkspaceInvitationEmail } from '@/lib/email';

// GET /api/workspaces/[workspaceId]/invitations - Get invitations for a workspace
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const _params = await params;
    const { workspaceId } = _params;

    // Get current user's role
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    // Check if the user is a global admin
    const isGlobalAdmin = currentUser?.role === 'admin';

    // Check if workspace exists and user is a member or owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: { userId: session.user.id }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const isOwnerOrMember = workspace.ownerId === session.user.id || workspace.members.length > 0;

    if (!isOwnerOrMember && !isGlobalAdmin) {
      return NextResponse.json(
        { error: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    // Get invitations for the workspace
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/invitations - Create a new invitation
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const _params = await params;
    const { workspaceId } = _params;
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get current user's role
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    // Check if the user is a global admin
    const isGlobalAdmin = currentUser?.role === 'admin';

    // Check if workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: { 
            userId: session.user.id,
            role: { in: ['owner', 'admin'] }
          }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Allow access if user is global admin, workspace owner, or workspace admin
    const isOwnerOrAdmin = workspace.ownerId === session.user.id || workspace.members.length > 0;
    
    if (!isOwnerOrAdmin && !isGlobalAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to invite members to this workspace' },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const existingMember = await prisma.user.findFirst({
      where: {
        email,
        OR: [
          { ownedWorkspaces: { some: { id: workspaceId } } },
          { workspaceMemberships: { some: { workspaceId } } }
        ]
      }
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this workspace' },
        { status: 400 }
      );
    }

    // Check if invitation already exists and is pending
    const existingInvitation = await prisma.workspaceInvitation.findFirst({
      where: {
        email,
        workspaceId,
        status: 'pending'
      }
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      );
    }

    // Create new invitation
    const token = uuidv4();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // Expires in 7 days

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        email,
        workspaceId,
        invitedById: session.user.id,
        token,
        status: 'pending',
        expiresAt: expirationDate
      }
    });

    // Send invitation email
    const inviterName = session.user.name || session.user.email || 'A team member';
    const emailResult = await sendWorkspaceInvitationEmail({
      to: email,
      inviterName,
      workspaceName: workspace.name,
      invitationToken: token
    });

    if (!emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error);
      // We still return success even if email fails, but log the error
    }

    return NextResponse.json({
      ...invitation,
      emailSent: emailResult.success
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating invitation:', error);
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId]/invitations?id=invitationId - Cancel/delete an invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const _params = await params;
    const { workspaceId } = _params;
    
    // Get the invitation ID from the URL search params
    const url = new URL(request.url);
    const invitationId = url.searchParams.get('id');
    
    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
        { status: 400 }
      );
    }

    // Get current user's role
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    // Check if the user is a global admin
    const isGlobalAdmin = currentUser?.role === 'admin';

    // Get the invitation to check permissions
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
      include: {
        workspace: {
          select: {
            ownerId: true,
            members: {
              where: {
                userId: session.user.id,
                role: { in: ['owner', 'admin'] }
              }
            }
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

    // Check if invitation belongs to the specified workspace
    if (invitation.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: 'Invitation does not belong to this workspace' },
        { status: 403 }
      );
    }

    // Check if the user has permission to cancel the invitation
    // Allow if user is global admin, workspace owner, or workspace admin
    const isOwnerOrAdmin = invitation.workspace.ownerId === session.user.id || invitation.workspace.members.length > 0;
    
    if (!isOwnerOrAdmin && !isGlobalAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to cancel this invitation' },
        { status: 403 }
      );
    }

    // Delete the invitation
    await prisma.workspaceInvitation.delete({
      where: { id: invitationId }
    });

    return NextResponse.json({ 
      success: true,
      message: 'Invitation cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    return NextResponse.json(
      { error: 'Failed to cancel invitation' },
      { status: 500 }
    );
  }
} 
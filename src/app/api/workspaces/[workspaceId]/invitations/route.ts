import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { sendWorkspaceInvitationEmail } from '@/lib/email';
import { checkUserPermission, Permission } from '@/lib/permissions';

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

    // Check if user has permission to view invitations
    const permissionResult = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.INVITE_MEMBERS
    );
    if (!permissionResult.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to view invitations for this workspace' },
        { status: 403 }
      );
    }
    // Get pending invitations for the workspace
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { 
        workspaceId,
        status: 'pending',
        expiresAt: {
          gte: new Date()
        }
      },
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

    // Check if user has permission to invite members
    const permissionResult = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.INVITE_MEMBERS
    );
    if (!permissionResult.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to invite members to this workspace' },
        { status: 403 }
      );
    }
    // Get workspace for invitation email
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
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

    // Check if user has permission to cancel invitations
    const permissionResult = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.INVITE_MEMBERS
    );

    if (!permissionResult.hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to cancel invitations for this workspace' },
        { status: 403 }
      );
    }

    // Get the invitation to verify it exists and belongs to the workspace
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { id: invitationId }
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
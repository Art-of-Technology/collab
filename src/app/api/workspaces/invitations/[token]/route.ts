import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceInvitation, acceptWorkspaceInvitation } from '@/lib/workspace-invitations';

// GET /api/workspaces/invitations/[token] - Get invitation details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await readWorkspaceInvitation(token);
    if (result.error) {
      const errors = {
        unauthorized: { error: 'Unauthorized. Please sign in to view the invitation.', status: 401 },
        missing: { error: 'Invitation not found', status: 404 },
        forbidden: { error: 'This invitation was sent to a different email address', status: 403 },
        processed: { error: 'This invitation has expired or already been used', status: 400 },
        expired: { error: 'This invitation has expired or already been used', status: 400 },
      };
      const { error, status } = errors[result.error];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json(result.invitation);
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json({ error: 'Failed to fetch invitation' }, { status: 500 });
  }
}

// POST /api/workspaces/invitations/[token] - Accept an invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await acceptWorkspaceInvitation(token, true);
    if (result.error) {
      if (result.error === 'already-member') {
        return NextResponse.json({ message: 'You are already a member of this workspace' });
      }
      const errors = {
        unauthorized: { error: 'Unauthorized. Please sign in to accept the invitation.', status: 401 },
        missing: { error: 'Invitation not found', status: 404 },
        forbidden: { error: 'This invitation was sent to a different email address', status: 403 },
        processed: { error: 'This invitation has expired or already been used', status: 400 },
        expired: { error: 'This invitation has expired or already been used', status: 400 },
        'inactive-member': { error: 'Failed to accept invitation', status: 500 },
        conflict: { error: 'This invitation changed. Please reload and try again.', status: 409 },
      };
      const { error, status } = errors[result.error];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({
      success: true,
      message: `You've successfully joined ${result.workspace.name}!`,
      workspaceId: result.workspace.id,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}

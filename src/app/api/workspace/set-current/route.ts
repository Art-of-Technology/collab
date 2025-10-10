import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthSession } from '@/lib/auth';
import { hasWorkspaceAccess } from '@/lib/workspace-helpers';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await request.json();
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Verify the user has access to this workspace
    const hasAccess = await hasWorkspaceAccess(session.user.id, workspaceId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to workspace' }, { status: 403 });
    }

    // Set the cookie server-side
    const cookieStore = await cookies();
    cookieStore.set({
      name: 'currentWorkspaceId',
      value: workspaceId,
      path: '/',
      maxAge: 31536000, // 1 year
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false // Allow client-side access
    });

    return NextResponse.json({ success: true, workspaceId });
  } catch (error) {
    console.error('Error setting current workspace:', error);
    return NextResponse.json(
      { error: 'Failed to set current workspace' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getUnreadCoclawCount,
  getRecentCoclawNotifications,
  markAllCoclawNotificationsRead,
} from '@/lib/coclaw/notifications';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/notifications
 *
 * Returns unread Coclaw notification count + recent activity for the current user.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;

    // Verify workspace membership
    const isMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
      select: { userId: true },
    });
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

    const [unreadCount, activity] = await Promise.all([
      getUnreadCoclawCount(session.user.id),
      getRecentCoclawNotifications(session.user.id, limit),
    ]);

    return NextResponse.json({ unreadCount, activity });
  } catch (error) {
    console.error('[coclaw/notifications] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/workspaces/[workspaceId]/coclaw/notifications
 *
 * Marks all unread Coclaw notifications as read for the current user.
 */
export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;

    const isMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
      select: { userId: true },
    });
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const marked = await markAllCoclawNotificationsRead(session.user.id);

    return NextResponse.json({ marked });
  } catch (error) {
    console.error('[coclaw/notifications] mark-read error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

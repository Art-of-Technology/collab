/**
 * GET /api/notes/[id]/secrets/audit-log
 *
 * Get the audit log for a note (especially useful for secrets).
 * Only accessible by note author or workspace admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { canAccessNote, getNoteAuditLog } from '@/lib/secrets/access';
import { getWorkspaceAuthority, may } from '@/lib/workspace-authority';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: noteId } = await params;
    const access = await canAccessNote(session.user.id, noteId);
    if (!access.canAccess) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const action = searchParams.get('action') || undefined;

    // Get the note to check ownership/admin
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        authorId: true,
        workspaceId: true
      }
    });

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Check if user is owner or admin
    const isOwner = note.authorId === session.user.id;
    const isAdmin = !isOwner && !!note.workspaceId &&
      may(await getWorkspaceAuthority(session.user.id, note.workspaceId), 'content.manage');

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the note author or workspace admin can view the audit log' },
        { status: 403 }
      );
    }

    // Get audit log
    const result = await getNoteAuditLog(noteId, {
      limit,
      offset,
      action
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 }
    );
  }
}

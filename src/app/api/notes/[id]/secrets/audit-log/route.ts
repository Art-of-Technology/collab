/**
 * GET /api/notes/[id]/secrets/audit-log
 *
 * Get the audit log for a note (especially useful for secrets).
 * Only accessible by note author or workspace admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getNoteAuditLog } from '@/lib/secrets/access';

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
    let isAdmin = false;

    if (note.workspaceId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: session.user.id,
            workspaceId: note.workspaceId
          }
        },
        select: { role: true }
      });

      isAdmin = membership?.role === 'ADMIN' || membership?.role === 'OWNER';
    }

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

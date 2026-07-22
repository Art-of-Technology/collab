/**
 * POST /api/notes/[id]/secrets/copy
 *
 * Log when a user copies a secret value.
 * Called from the frontend after copying to clipboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { canAccessNote, logNoteAccess } from '@/lib/secrets/access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: noteId } = await params;
    const body = await request.json();
    const { key, copyAll } = body as { key?: string; copyAll?: boolean };

    // Verify note exists
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        isEncrypted: true
      }
    });

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    // Check access
    const accessResult = await canAccessNote(session.user.id, noteId);

    if (!accessResult.canAccess) {
      await logNoteAccess(
        noteId,
        session.user.id,
        'ACCESS_DENIED',
        { reason: accessResult.reason, attemptedAction: 'COPY' },
        request
      );

      return NextResponse.json(
        { error: accessResult.reason || 'Access denied' },
        { status: 403 }
      );
    }

    // Log the copy action
    await logNoteAccess(
      noteId,
      session.user.id,
      copyAll ? 'COPY_ALL' : 'COPY',
      { key: key || null },
      request
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging copy action:', error);
    return NextResponse.json(
      { error: 'Failed to log action' },
      { status: 500 }
    );
  }
}

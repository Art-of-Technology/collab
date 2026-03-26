/**
 * POST /api/notes/[id]/secrets/reveal
 *
 * Decrypt and reveal secret values for an encrypted note.
 * Logs the REVEAL action for audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import {
  decryptVariables,
  decryptRawContent,
  SecretVariable,
  isSecretsEnabled
} from '@/lib/secrets/crypto';
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

    if (!isSecretsEnabled()) {
      return NextResponse.json(
        { error: 'Secrets feature is not enabled. SECRETS_MASTER_KEY is not configured.' },
        { status: 503 }
      );
    }

    const { id: noteId } = await params;
    const body = await request.json().catch(() => ({}));
    const { keys } = body as { keys?: string[] };

    // Get the note
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: {
        sharedWith: {
          select: {
            userId: true,
            permission: true
          }
        }
      }
    });

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    if (!note.isEncrypted) {
      return NextResponse.json(
        { error: 'This note is not encrypted' },
        { status: 400 }
      );
    }

    // Check access
    const accessResult = await canAccessNote(session.user.id, noteId);

    if (!accessResult.canAccess) {
      // Log denied access attempt
      await logNoteAccess(
        noteId,
        session.user.id,
        'ACCESS_DENIED',
        { reason: accessResult.reason, attemptedAction: 'REVEAL' },
        request
      );

      return NextResponse.json(
        { error: accessResult.reason || 'Access denied' },
        { status: 403 }
      );
    }

    if (!note.workspaceId) {
      return NextResponse.json(
        { error: 'Note must belong to a workspace for encryption' },
        { status: 400 }
      );
    }

    // Decrypt the secrets
    let result: {
      variables?: { key: string; value: string; masked: boolean; description?: string }[];
      rawContent?: string;
    } = {};

    // Handle key-value mode (secretVariables)
    if (note.secretVariables) {
      const encryptedVars = JSON.parse(note.secretVariables) as SecretVariable[];
      const decryptedVars = decryptVariables(encryptedVars, note.workspaceId);

      // Filter by requested keys if specified
      if (keys && keys.length > 0) {
        result.variables = decryptedVars.filter(v => keys.includes(v.key));
      } else {
        result.variables = decryptedVars;
      }
    }

    // Handle raw mode (encryptedContent)
    if (note.encryptedContent && !note.secretVariables) {
      result.rawContent = decryptRawContent(note.encryptedContent, note.workspaceId);
    }

    // Log the reveal action
    await logNoteAccess(
      noteId,
      session.user.id,
      'REVEAL',
      {
        keys: keys || 'all',
        variableCount: result.variables?.length || 0,
        hasRawContent: !!result.rawContent
      },
      request
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error revealing secrets:', error);
    return NextResponse.json(
      { error: 'Failed to decrypt secrets' },
      { status: 500 }
    );
  }
}

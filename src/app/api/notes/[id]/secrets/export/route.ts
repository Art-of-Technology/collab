/**
 * GET /api/notes/[id]/secrets/export
 *
 * Export secrets as .env or JSON file.
 * Logs the EXPORT action for audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import {
  decryptVariables,
  decryptRawContent,
  toEnvContent,
  SecretVariable,
  isSecretsEnabled
} from '@/lib/secrets/crypto';
import { canAccessNote, logNoteAccess } from '@/lib/secrets/access';

export async function GET(
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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'env';

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
      await logNoteAccess(
        noteId,
        session.user.id,
        'ACCESS_DENIED',
        { reason: accessResult.reason, attemptedAction: 'EXPORT' },
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

    let content: string;
    let contentType: string;
    let filename: string;

    // Handle key-value mode (secretVariables)
    if (note.secretVariables) {
      const encryptedVars = JSON.parse(note.secretVariables) as SecretVariable[];
      const decryptedVars = decryptVariables(encryptedVars, note.workspaceId);

      if (format === 'json') {
        content = JSON.stringify(
          decryptedVars.reduce((acc, v) => {
            acc[v.key] = v.value;
            return acc;
          }, {} as Record<string, string>),
          null,
          2
        );
        contentType = 'application/json';
        filename = `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      } else {
        content = toEnvContent(decryptedVars);
        contentType = 'text/plain';
        filename = `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.env`;
      }
    }
    // Handle raw mode (encryptedContent)
    else if (note.encryptedContent) {
      content = decryptRawContent(note.encryptedContent, note.workspaceId);

      if (format === 'json') {
        // Parse .env to JSON
        const lines = content.split('\n');
        const obj: Record<string, string> = {};

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const equalIndex = trimmed.indexOf('=');
          if (equalIndex === -1) continue;

          const key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();

          // Remove surrounding quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          if (key) obj[key] = value;
        }

        content = JSON.stringify(obj, null, 2);
        contentType = 'application/json';
        filename = `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      } else {
        contentType = 'text/plain';
        filename = `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.env`;
      }
    } else {
      return NextResponse.json(
        { error: 'No encrypted content found' },
        { status: 400 }
      );
    }

    // Log the export action
    await logNoteAccess(
      noteId,
      session.user.id,
      'EXPORT',
      { format, filename },
      request
    );

    // Return as downloadable file
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error exporting secrets:', error);
    return NextResponse.json(
      { error: 'Failed to export secrets' },
      { status: 500 }
    );
  }
}

/**
 * Third-Party App API: Reveal Secrets Endpoint
 * POST /api/apps/auth/secrets/[id]/reveal - Decrypt and reveal secret values
 *
 * Reveals actual secret values for an encrypted note.
 * Creates an audit log entry for security tracking.
 *
 * Required scopes: secrets:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { NoteType, NoteScope } from '@prisma/client';
import {
  decryptVariables,
  decryptRawContent,
  SecretVariable,
  isSecretsEnabled,
} from '@/lib/secrets/crypto';
import { logNoteAccess } from '@/lib/secrets/access';
import { z } from 'zod';

// Note types that are considered secrets
const SECRET_TYPES = [
  NoteType.ENV_VARS,
  NoteType.API_KEYS,
  NoteType.CREDENTIALS,
];

// Request body schema
const RevealRequestSchema = z.object({
  keys: z.array(z.string()).optional(), // Specific keys to reveal, or all if omitted
});

/**
 * POST /api/apps/auth/secrets/[id]/reveal
 * Reveal secret values
 */
export const POST = withAppAuth(
  // Note: In Next.js 15, withAppAuth injects context as 2nd arg, so route params come as 3rd arg
  // with structure { params: Promise<{ id: string }> } due to async params in App Router
  async (request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await routeParams.params;

      // Check if secrets feature is enabled
      if (!isSecretsEnabled()) {
        return NextResponse.json(
          { error: 'secrets_disabled', error_description: 'Secrets feature is not enabled' },
          { status: 503 }
        );
      }

      // Parse request body - empty body reveals all keys
      let body: { keys?: string[] } = {};
      const rawBody = await request.text();
      if (rawBody.trim().length > 0) {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawBody);
        } catch {
          return NextResponse.json(
            { error: 'invalid_request', error_description: 'Malformed JSON in request body' },
            { status: 400 }
          );
        }
        const parseResult = RevealRequestSchema.safeParse(parsedJson);
        if (!parseResult.success) {
          return NextResponse.json(
            { error: 'invalid_request', error_description: 'Invalid request body: ' + parseResult.error.message },
            { status: 400 }
          );
        }
        body = parseResult.data;
      }

      // Find the secret note
      const note = await prisma.note.findFirst({
        where: {
          id,
          workspaceId: context.workspace.id,
          type: { in: SECRET_TYPES },
          isEncrypted: true,
          // Allow access to workspace, public, and project-scoped secrets via MCP
          // PERSONAL secrets are excluded for privacy
          scope: { in: [NoteScope.WORKSPACE, NoteScope.PUBLIC, NoteScope.PROJECT] },
        },
        select: {
          id: true,
          title: true,
          type: true,
          workspaceId: true,
          isRestricted: true,
          expiresAt: true,
          secretVariables: true,
          encryptedContent: true,
        },
      });

      if (!note) {
        return NextResponse.json(
          { error: 'secret_not_found', error_description: 'Secret not found or access denied' },
          { status: 404 }
        );
      }

      // Check if secret has expired
      if (note.expiresAt && new Date(note.expiresAt) < new Date()) {
        return NextResponse.json(
          { error: 'secret_expired', error_description: 'This secret has expired' },
          { status: 403 }
        );
      }

      // Decrypt the secrets
      let result: {
        variables?: { key: string; value: string }[];
        rawContent?: string;
      } = {};

      // Handle key-value mode (secretVariables)
      if (note.secretVariables) {
        const encryptedVars = JSON.parse(note.secretVariables) as SecretVariable[];
        const decryptedVars = decryptVariables(encryptedVars, note.workspaceId!);

        // Filter by requested keys if specified
        if (body.keys && body.keys.length > 0) {
          result.variables = decryptedVars
            .filter(v => body.keys!.includes(v.key))
            .map(v => ({ key: v.key, value: v.value }));
        } else {
          result.variables = decryptedVars.map(v => ({ key: v.key, value: v.value }));
        }
      }

      // Handle raw mode (encryptedContent)
      if (note.encryptedContent && !note.secretVariables) {
        result.rawContent = decryptRawContent(note.encryptedContent, note.workspaceId!);
      }

      // Log the reveal action for audit trail
      await logNoteAccess(
        note.id,
        context.user.id,
        'REVEAL',
        {
          keys: body.keys || 'all',
          variableCount: result.variables?.length || 0,
          hasRawContent: !!result.rawContent,
          accessMethod: 'MCP',
          appId: context.app.id,
          appName: context.app.name,
        },
        request
      );

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error revealing secrets:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Failed to decrypt secrets' },
        { status: 500 }
      );
    }
  },
  { requiredScopes: ['secrets:read'] }
);

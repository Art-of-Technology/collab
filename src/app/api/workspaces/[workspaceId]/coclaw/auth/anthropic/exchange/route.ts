import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exchangeCodeForToken, type PkceState } from '@/lib/coclaw/anthropic-oauth';
import { storeUserKey } from '@/lib/coclaw/key-resolver';
import { decryptVariables, type SecretVariable } from '@/lib/secrets/crypto';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * POST /api/workspaces/[workspaceId]/coclaw/auth/anthropic/exchange
 *
 * Completes the Anthropic OAuth flow:
 * 1. Retrieves stored PKCE state
 * 2. Exchanges authorization code for access token
 * 3. Stores the token as the user's Anthropic key
 * 4. Cleans up the temporary PKCE state
 *
 * Body: { code: string } — the code the user pasted (format: "code" or "code#state")
 */
export async function POST(
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
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId: session.user.id } },
      },
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const body = await request.json();
    const { code } = body as { code?: string };

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 },
      );
    }

    // Retrieve stored PKCE state
    const pkceNote = await prisma.note.findFirst({
      where: {
        authorId: session.user.id,
        workspaceId,
        type: 'API_KEYS',
        scope: 'PERSONAL',
        title: 'Coclaw OAuth PKCE - anthropic',
      },
      select: { id: true, secretVariables: true },
    });

    if (!pkceNote?.secretVariables) {
      return NextResponse.json(
        { error: 'No pending OAuth flow found. Please start the connection flow again.' },
        { status: 400 },
      );
    }

    // Decrypt PKCE state
    let pkce: PkceState;
    try {
      const vars = JSON.parse(pkceNote.secretVariables) as SecretVariable[];
      const decrypted = decryptVariables(vars, workspaceId);
      const verifier = decrypted.find(v => v.key === 'code_verifier')?.value;
      const challenge = decrypted.find(v => v.key === 'code_challenge')?.value;
      const state = decrypted.find(v => v.key === 'state')?.value;

      if (!verifier || !challenge || !state) {
        throw new Error('Incomplete PKCE state');
      }

      pkce = { codeVerifier: verifier, codeChallenge: challenge, state };
    } catch (err) {
      console.error('[CoclawOAuth] Failed to decrypt PKCE state:', err);
      return NextResponse.json(
        { error: 'Failed to retrieve OAuth state. Please start the connection flow again.' },
        { status: 400 },
      );
    }

    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(code.trim(), pkce);

    // Store the access token as the user's Anthropic key
    // sk-ant-oat01-* tokens are automatically detected as Bearer/subscription by Coclaw
    await storeUserKey(
      session.user.id,
      workspaceId,
      'anthropic',
      tokenResponse.access_token,
    );

    // Clean up the temporary PKCE note
    await prisma.note.delete({ where: { id: pkceNote.id } });

    return NextResponse.json({
      success: true,
      tokenType: tokenResponse.token_type,
      expiresIn: tokenResponse.expires_in,
      hasRefreshToken: !!tokenResponse.refresh_token,
    });
  } catch (error) {
    console.error('[CoclawOAuth] Error exchanging Anthropic OAuth code:', error);
    const message = error instanceof Error ? error.message : 'Token exchange failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

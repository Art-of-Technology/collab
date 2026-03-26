import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePkceState, buildAuthorizeUrl } from '@/lib/coclaw/anthropic-oauth';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * POST /api/workspaces/[workspaceId]/coclaw/auth/anthropic/start
 *
 * Starts the Anthropic OAuth flow:
 * 1. Generates PKCE state
 * 2. Stores it in a temporary Note for the exchange step
 * 3. Returns the authorize URL for the frontend to open
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

    // Generate PKCE state
    const pkce = generatePkceState();
    const authorizeUrl = buildAuthorizeUrl(pkce);

    // Store PKCE state temporarily (encrypted Note with special title)
    // This will be retrieved during the exchange step
    const { encryptVariables } = await import('@/lib/secrets/crypto');
    const title = 'Coclaw OAuth PKCE - anthropic';

    const encrypted = encryptVariables(
      [
        { key: 'code_verifier', value: pkce.codeVerifier, masked: true, description: 'PKCE verifier' },
        { key: 'code_challenge', value: pkce.codeChallenge, masked: true, description: 'PKCE challenge' },
        { key: 'state', value: pkce.state, masked: true, description: 'OAuth state' },
      ],
      workspaceId,
    );

    // Upsert — only one pending flow per user per workspace
    const existing = await prisma.note.findFirst({
      where: {
        authorId: session.user.id,
        workspaceId,
        type: 'API_KEYS',
        scope: 'PERSONAL',
        title,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.note.update({
        where: { id: existing.id },
        data: {
          secretVariables: JSON.stringify(encrypted),
          isEncrypted: true,
        },
      });
    } else {
      await prisma.note.create({
        data: {
          title,
          content: '',
          type: 'API_KEYS',
          scope: 'PERSONAL',
          isEncrypted: true,
          isRestricted: true,
          isAiContext: false,
          secretVariables: JSON.stringify(encrypted),
          authorId: session.user.id,
          workspaceId,
        },
      });
    }

    return NextResponse.json({
      authorizeUrl,
      state: pkce.state,
    });
  } catch (error) {
    console.error('[CoclawOAuth] Error starting Anthropic OAuth:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

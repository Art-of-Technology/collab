import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  listConfiguredProviders,
  storeUserKey,
} from '@/lib/coclaw/key-resolver';
import { PROVIDER_ENV_MAP, PROVIDER_KEY_PREFIXES } from '@/lib/coclaw/types';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/keys
 * List configured AI provider keys for the current user.
 * Never returns actual key values — only configuration status.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;

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

    const providers = await listConfiguredProviders(session.user.id, workspaceId);

    return NextResponse.json({ providers });
  } catch (error) {
    console.error('Error listing Coclaw keys:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/coclaw/keys
 * Store or update an AI provider API key.
 * Body: { provider: string, apiKey: string }
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
    const { provider, apiKey } = body as { provider?: string; apiKey?: string };

    // Validate provider
    if (!provider || !PROVIDER_ENV_MAP[provider]) {
      return NextResponse.json(
        { error: `Invalid provider. Supported: ${Object.keys(PROVIDER_ENV_MAP).join(', ')}` },
        { status: 400 },
      );
    }

    // Validate key is non-empty
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 },
      );
    }

    // Basic prefix validation (non-blocking — some keys may have non-standard formats)
    const prefix = PROVIDER_KEY_PREFIXES[provider];
    if (prefix && !apiKey.startsWith(prefix)) {
      console.warn(
        `[CoclawKeys] Key for ${provider} does not start with expected prefix "${prefix}"`,
      );
    }

    await storeUserKey(session.user.id, workspaceId, provider, apiKey.trim());

    return NextResponse.json({ success: true, provider });
  } catch (error) {
    console.error('Error storing Coclaw key:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

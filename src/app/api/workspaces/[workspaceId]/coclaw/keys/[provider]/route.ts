import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { removeUserKey } from '@/lib/coclaw/key-resolver';
import { PROVIDER_ENV_MAP } from '@/lib/coclaw/types';

type RouteContext = {
  params: Promise<{ workspaceId: string; provider: string }>;
};

/**
 * DELETE /api/workspaces/[workspaceId]/coclaw/keys/[provider]
 * Remove a stored API key for a specific provider.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, provider } = await params;

    // Validate provider
    if (!PROVIDER_ENV_MAP[provider]) {
      return NextResponse.json(
        { error: `Invalid provider. Supported: ${Object.keys(PROVIDER_ENV_MAP).join(', ')}` },
        { status: 400 },
      );
    }

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

    const deleted = await removeUserKey(session.user.id, workspaceId, provider);

    if (!deleted) {
      return NextResponse.json(
        { error: 'No key found for this provider' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, provider });
  } catch (error) {
    console.error('Error removing Coclaw key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

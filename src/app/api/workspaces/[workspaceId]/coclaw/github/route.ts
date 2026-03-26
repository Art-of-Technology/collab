import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getGitHubTokenStatus,
  storeGitHubToken,
  removeGitHubToken,
} from '@/lib/coclaw/key-resolver';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/github
 * Get GitHub token configuration status for the current user.
 * Never returns the actual token — only configuration metadata.
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

    const status = await getGitHubTokenStatus(session.user.id, workspaceId);

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting GitHub token status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/coclaw/github
 * Store or update a GitHub personal access token.
 * Body: { token: string, defaultOwner?: string, defaultRepo?: string }
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
    const { token, defaultOwner, defaultRepo } = body as {
      token?: string;
      defaultOwner?: string;
      defaultRepo?: string;
    };

    // Validate token is non-empty
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return NextResponse.json(
        { error: 'GitHub token is required' },
        { status: 400 },
      );
    }

    // Basic prefix validation
    const trimmed = token.trim();
    if (!trimmed.startsWith('ghp_') && !trimmed.startsWith('github_pat_') && !trimmed.startsWith('gho_')) {
      console.warn(
        '[CoclawGitHub] Token does not start with expected prefix (ghp_, github_pat_, gho_)',
      );
    }

    await storeGitHubToken(
      session.user.id,
      workspaceId,
      trimmed,
      defaultOwner?.trim() || undefined,
      defaultRepo?.trim() || undefined,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing GitHub token:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/coclaw/github
 * Remove the stored GitHub token.
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

    const deleted = await removeGitHubToken(session.user.id, workspaceId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'No GitHub token found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing GitHub token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

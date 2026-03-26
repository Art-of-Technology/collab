import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptVariable } from '@/lib/secrets/crypto';

type RouteContext = {
  params: Promise<{ workspaceId: string; channelType: string }>;
};

/**
 * GET /api/workspaces/[workspaceId]/coclaw/channels/[channelType]
 * Get channel configuration detail (metadata only, no credentials).
 * Returns a fieldsMask showing which fields are configured without revealing values.
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

    const { workspaceId, channelType } = await params;

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

    const config = await prisma.coclawChannelConfig.findUnique({
      where: {
        userId_workspaceId_channelType: {
          userId: session.user.id,
          workspaceId,
          channelType,
        },
      },
      select: {
        channelType: true,
        config: true,
        enabled: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Channel configuration not found' },
        { status: 404 },
      );
    }

    // Decrypt config to determine which fields are set
    let decryptedConfig: Record<string, unknown> = {};
    try {
      const decrypted = decryptVariable(config.config, workspaceId);
      decryptedConfig = JSON.parse(decrypted) as Record<string, unknown>;
    } catch (error) {
      console.error('Error decrypting channel config:', error);
      // If decryption fails, return empty fieldsMask
    }

    // Build fieldsMask: boolean indicating which fields are configured
    const fieldsMask: Record<string, boolean> = {};
    for (const key of Object.keys(decryptedConfig)) {
      const value = decryptedConfig[key];
      fieldsMask[key] = value !== undefined && value !== null && value !== '';
    }

    return NextResponse.json({
      channelType: config.channelType,
      enabled: config.enabled,
      status: config.status,
      lastError: config.lastError,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      fieldsMask,
    });
  } catch (error) {
    console.error('Error getting Coclaw channel detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/coclaw/channels/[channelType]
 * Remove a channel configuration.
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

    const { workspaceId, channelType } = await params;

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

    const deleted = await prisma.coclawChannelConfig.delete({
      where: {
        userId_workspaceId_channelType: {
          userId: session.user.id,
          workspaceId,
          channelType,
        },
      },
    });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Channel configuration not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, channelType });
  } catch (error) {
    console.error('Error deleting Coclaw channel config:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Channel configuration not found' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

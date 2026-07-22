import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SUPPORTED_CHANNELS } from '@/lib/coclaw/types';
import { encryptVariable } from '@/lib/secrets/crypto';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/channels
 * List configured channels for the current user.
 * Never returns actual credentials — only configuration metadata.
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

    const configs = await prisma.coclawChannelConfig.findMany({
      where: {
        userId: session.user.id,
        workspaceId,
      },
      select: {
        channelType: true,
        enabled: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ channels: configs });
  } catch (error) {
    console.error('Error listing Coclaw channels:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/coclaw/channels
 * Add or update a channel configuration.
 * Body: { channelType: string, config: Record<string, unknown>, enabled?: boolean }
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
    const { channelType, config, enabled } = body as {
      channelType?: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
    };

    // Validate channelType
    if (!channelType || typeof channelType !== 'string') {
      return NextResponse.json(
        { error: 'channelType is required and must be a string' },
        { status: 400 },
      );
    }

    const channelMetadata = SUPPORTED_CHANNELS.find(ch => ch.type === channelType);
    if (!channelMetadata) {
      return NextResponse.json(
        {
          error: `Invalid channel type. Supported: ${SUPPORTED_CHANNELS.map(ch => ch.type).join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Validate config object
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return NextResponse.json(
        { error: 'config is required and must be an object' },
        { status: 400 },
      );
    }

    // Validate required fields
    const requiredFields = channelMetadata.fields.filter(f => f.required);
    for (const field of requiredFields) {
      const value = config[field.key];
      if (value === undefined || value === null || value === '') {
        return NextResponse.json(
          { error: `Required field "${field.label}" (${field.key}) is missing or empty` },
          { status: 400 },
        );
      }
    }

    // Encrypt the config
    const encryptedConfig = encryptVariable(JSON.stringify(config), workspaceId);

    // Upsert the channel config
    await prisma.coclawChannelConfig.upsert({
      where: {
        userId_workspaceId_channelType: {
          userId: session.user.id,
          workspaceId,
          channelType,
        },
      },
      create: {
        userId: session.user.id,
        workspaceId,
        channelType,
        config: encryptedConfig,
        enabled: enabled ?? true,
        status: 'DISCONNECTED',
      },
      update: {
        config: encryptedConfig,
        enabled: enabled ?? true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, channelType });
  } catch (error) {
    console.error('Error storing Coclaw channel config:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

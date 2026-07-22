import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { coclawManager } from '@/lib/coclaw/instance-manager';
import { resolveApiKey } from '@/lib/coclaw/key-resolver';
import { getMcpToken } from '@/lib/ai/mcp-token';
import type { CoclawSpawnConfig } from '@/lib/coclaw/types';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/instances
 * Returns the current user's Coclaw instance status (or null if none).
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

    // Check in-memory state first for live status
    const liveInfo = coclawManager.getInstanceInfo(session.user.id, workspaceId);

    // Also check DB for persistent state
    const dbRecord = await prisma.coclawInstance.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
    });

    if (liveInfo) {
      return NextResponse.json({
        status: liveInfo.status,
        port: liveInfo.port,
        pid: liveInfo.pid,
        startedAt: liveInfo.startedAt,
        apiKeySource: liveInfo.apiKeySource,
        providerId: liveInfo.providerId,
      });
    }

    if (dbRecord) {
      return NextResponse.json({
        status: dbRecord.status,
        port: dbRecord.port,
        startedAt: dbRecord.startedAt,
        apiKeySource: dbRecord.apiKeySource,
        providerId: dbRecord.providerId,
        lastError: dbRecord.lastError,
      });
    }

    return NextResponse.json({ status: null });
  } catch (error) {
    console.error('Error fetching Coclaw instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/coclaw/instances
 * Provision or start a Coclaw instance for the current user.
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

    // Parse optional provider from body
    let provider = 'anthropic';
    try {
      const body = await request.json();
      if (body.provider) provider = body.provider;
    } catch {
      // No body or invalid JSON — use default provider
    }

    // Resolve API key
    const keyResolution = await resolveApiKey(
      session.user.id,
      workspaceId,
      provider,
    );

    // Get MCP token for the Coclaw instance
    const mcpToken = await getMcpToken(prisma, session.user.id, workspaceId);

    const embeddingApiUrl = process.env.EMBEDDING_API_URL || 'http://embeddings:3360';
    const spawnConfig: CoclawSpawnConfig = {
      collabApiUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      mcpToken,
      userId: session.user.id,
      workspaceId,
      apiKey: keyResolution.key,
      apiKeySource: keyResolution.source,
      provider: keyResolution.provider,
      port: 0, // Will be allocated by the manager
      memoryBackend: 'collab',
      qdrantCollection: process.env.QDRANT_COLLECTION || 'collab_context',
      embeddingProvider: `custom:${embeddingApiUrl}`,
      embeddingModel: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
      embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10),
    };

    const info = await coclawManager.getOrCreateInstance(
      session.user.id,
      workspaceId,
      spawnConfig,
    );

    return NextResponse.json({
      status: info.status,
      port: info.port,
      pid: info.pid,
      startedAt: info.startedAt,
      apiKeySource: info.apiKeySource,
      providerId: info.providerId,
    });
  } catch (error) {
    console.error('Error provisioning Coclaw instance:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('limit reached') ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

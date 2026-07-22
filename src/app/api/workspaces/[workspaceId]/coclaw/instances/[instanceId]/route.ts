import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { coclawManager } from '@/lib/coclaw/instance-manager';

type RouteContext = {
  params: Promise<{ workspaceId: string; instanceId: string }>;
};

/**
 * GET /api/workspaces/[workspaceId]/coclaw/instances/[instanceId]
 * Get detailed status for a specific Coclaw instance.
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

    const { workspaceId, instanceId } = await params;

    const instance = await prisma.coclawInstance.findFirst({
      where: {
        id: instanceId,
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    // Check live health if running
    let healthy = false;
    if (instance.status === 'RUNNING') {
      healthy = await coclawManager.healthCheck(session.user.id, workspaceId);
    }

    return NextResponse.json({
      id: instance.id,
      status: instance.status,
      port: instance.port,
      processId: instance.processId,
      apiKeySource: instance.apiKeySource,
      providerId: instance.providerId,
      startedAt: instance.startedAt,
      stoppedAt: instance.stoppedAt,
      lastActiveAt: instance.lastActiveAt,
      lastError: instance.lastError,
      healthy,
    });
  } catch (error) {
    console.error('Error fetching Coclaw instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/coclaw/instances/[instanceId]
 * Stop a Coclaw instance.
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

    const { workspaceId, instanceId } = await params;

    // Verify ownership
    const instance = await prisma.coclawInstance.findFirst({
      where: {
        id: instanceId,
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    await coclawManager.stopInstance(session.user.id, workspaceId);

    return NextResponse.json({ status: 'STOPPED' });
  } catch (error) {
    console.error('Error stopping Coclaw instance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

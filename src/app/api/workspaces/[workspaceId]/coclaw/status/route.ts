import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { coclawManager } from '@/lib/coclaw/instance-manager';
import { buildSpawnConfig } from '@/lib/coclaw/spawn-helpers';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/status
 *
 * Returns the full Coclaw agent status for the current user:
 * - Instance status (RUNNING, STOPPED, etc.)
 * - Gateway health + rich status (provider, model, uptime, channels, etc.)
 * - Combined into a single response for the client to render status pills.
 *
 * Supports both local mode (direct 127.0.0.1 fetch) and remote mode
 * (proxy through coclaw-manager via healthCheck).
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

    // Check in-memory / cached instance info
    const instanceInfo = coclawManager.getInstanceInfo(session.user.id, workspaceId);

    if (!instanceInfo || instanceInfo.status !== 'RUNNING') {
      // Check DB for last known state
      const dbInstance = await prisma.coclawInstance.findUnique({
        where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
        select: {
          status: true,
          lastActiveAt: true,
          lastError: true,
          startedAt: true,
          stoppedAt: true,
        },
      }).catch(() => null);

      // Auto-respawn: if instance is STOPPED/ERROR and user has an API key,
      // try to restart it transparently so Coclaw feels "always-on"
      const shouldAutoRespawn =
        !instanceInfo || instanceInfo.status === 'STOPPED' || instanceInfo.status === 'ERROR';
      if (shouldAutoRespawn) {
        try {
          const spawnConfig = await buildSpawnConfig(session.user.id, workspaceId);
          if (spawnConfig) {
            // Fire-and-forget — don't block the status response
            coclawManager
              .getOrCreateInstance(session.user.id, workspaceId, spawnConfig)
              .catch((err) =>
                console.warn('[coclaw/status] Auto-respawn failed:', err),
              );
          }
        } catch {
          // No API key or config — can't auto-respawn, that's fine
        }
      }

      return NextResponse.json({
        instance: {
          status: dbInstance?.status || 'STOPPED',
          lastActiveAt: dbInstance?.lastActiveAt || null,
          lastError: dbInstance?.lastError || null,
          startedAt: dbInstance?.startedAt || null,
          stoppedAt: dbInstance?.stoppedAt || null,
        },
        gateway: null,
        healthy: false,
      });
    }

    // Keep-alive: touch the instance TTL on every status poll.
    // This ensures that as long as the user has the platform open,
    // their Coclaw instance stays warm.
    coclawManager.touchInstance(session.user.id, workspaceId).catch(() => {});
    // Instance is RUNNING — fetch gateway status
    // In remote mode, proxy through coclaw-manager; in local mode, hit localhost directly
    let gatewayStatus = null;
    let healthy = false;

    const managerUrl = process.env.COCLAW_MANAGER_URL;

    if (managerUrl) {
      // Remote mode — proxy via coclaw-manager
      try {
        const token = process.env.COCLAW_MANAGER_TOKEN || '';
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          `${managerUrl.replace(/\/+$/, '')}/api/instances/${encodeURIComponent(session.user.id)}/${encodeURIComponent(workspaceId)}/gateway-status`,
          { signal: controller.signal, headers },
        );
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json() as { gateway?: unknown; healthy?: boolean };
          gatewayStatus = data.gateway ?? null;
          healthy = data.healthy === true;
        }
      } catch {
        // coclaw-manager unreachable — still report instance info
      }
    } else {
      // Local mode — direct fetch to instance gateway
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`http://127.0.0.1:${instanceInfo.port}/api/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          gatewayStatus = await res.json();
          healthy = true;
        }
      } catch {
        // Gateway not responding — still report instance info
      }
    }

    return NextResponse.json({
      instance: {
        status: instanceInfo.status,
        pid: instanceInfo.pid,
        port: instanceInfo.port,
        apiKeySource: instanceInfo.apiKeySource,
        providerId: instanceInfo.providerId,
        startedAt: instanceInfo.startedAt,
        lastActiveAt: null, // in-memory only
      },
      gateway: gatewayStatus,
      healthy,
    });
  } catch (error) {
    console.error('[coclaw/status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Coclaw status' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { getRedisSubscriber } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Extend timeout to 5 minutes for streaming

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { workspaceId } = resolvedParams;

    // Verify access to workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      }
    });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const channel = `workspace:${workspaceId}:events`;
    const encoder = new TextEncoder();

    // Track stream state outside the ReadableStream to handle async callbacks
    let isClosed = false;
    let pingInterval: NodeJS.Timeout | null = null;
    let subscriber: any = null;
    let isRedisConnected = false;

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const sendEvent = (data: Record<string, unknown>) => {
          // Check closed flag first (most reliable)
          if (isClosed) return;

          try {
            const payload = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (error) {
            // Stream is closed, mark it and stop trying
            isClosed = true;
          }
        };

        // CRITICAL: Send immediate connected event to establish stream quickly
        sendEvent({ type: 'connected', channel, timestamp: Date.now() });

        // Set up ping interval immediately to keep connection alive
        pingInterval = setInterval(() => {
          if (isClosed) {
            if (pingInterval) clearInterval(pingInterval);
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            isClosed = true;
            if (pingInterval) clearInterval(pingInterval);
          }
        }, 25000);

        // Set up Redis subscriber asynchronously to avoid blocking initial response
        const setupRedisSubscriber = async () => {
          if (isClosed) return;

          try {
            // Add timeout for Redis connection (5 seconds max)
            const redisTimeout = setTimeout(() => {
              if (!isClosed) {
                console.warn('Redis subscriber setup timed out after 5 seconds');
                sendEvent({ type: 'realtime.degraded', reason: 'redis_timeout' });
              }
            }, 5000);

            subscriber = await getRedisSubscriber();
            clearTimeout(redisTimeout);

            if (isClosed) return; // Check again after async operation

            if (!subscriber) {
              console.warn('Redis subscriber not available, running in degraded mode');
              sendEvent({ type: 'realtime.degraded', reason: 'redis_unavailable' });
              return;
            }

            // Subscribe to Redis channel
            await subscriber.subscribe(channel, (message: string) => {
              // Always check if closed before processing
              if (isClosed) return;

              try {
                if (message && typeof message === 'string') {
                  const parsed = JSON.parse(message);
                  sendEvent(parsed);
                }
              } catch (parseError) {
                if (message && !isClosed) {
                  sendEvent({ type: 'message', message: String(message) });
                }
              }
            });

            if (isClosed) return; // Check again after subscribe

            isRedisConnected = true;
            sendEvent({ type: 'realtime.ready', channel });
            console.log(`SSE Redis subscriber connected for workspace ${workspaceId}`);
          } catch (error) {
            if (!isClosed) {
              console.error('Error setting up Redis subscriber:', error);
              sendEvent({ type: 'realtime.error', error: 'Failed to connect to Redis' });
            }
          }
        };

        // Start Redis setup asynchronously (don't await)
        setupRedisSubscriber();

        const cleanup = async () => {
          // Mark as closed immediately to stop all async operations
          isClosed = true;

          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }

          if (subscriber && isRedisConnected) {
            try {
              await subscriber.unsubscribe(channel);
              await subscriber.quit();
              console.log(`SSE Redis subscriber disconnected for workspace ${workspaceId}`);
            } catch (error) {
              // Ignore cleanup errors
            }
            subscriber = null;
            isRedisConnected = false;
          }

          try {
            controller.close();
          } catch {
            // Already closed
          }
        };

        // Handle client disconnect
        const signal = request.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', cleanup);
        }
      },
      cancel: async () => {
        isClosed = true;
        if (pingInterval) clearInterval(pingInterval);
        if (subscriber && isRedisConnected) {
          try {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          } catch {}
        }
        console.log(`SSE stream cancelled for workspace ${workspaceId}`);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    console.error('SSE workspace stream error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}



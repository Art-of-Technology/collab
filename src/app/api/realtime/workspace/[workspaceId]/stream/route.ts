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

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const sendEvent = (data: Record<string, unknown>) => {
          try {
            // Ensure controller is still active before sending
            if (controller.desiredSize === null) {
              return; // Stream is closed
            }
            const payload = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (error) {
            console.error('Error sending SSE event:', error);
            // Don't re-throw - just log and continue
          }
        };

        // CRITICAL: Send immediate connected event to establish stream quickly
        sendEvent({ type: 'connected', channel, timestamp: Date.now() });

        // Set up ping interval immediately to keep connection alive
        const pingInterval = setInterval(() => {
          try {
            if (controller.desiredSize !== null) {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            }
          } catch {
            // ignore - connection likely closed
          }
        }, 25000);

        let subscriber: any = null;
        let isRedisConnected = false;

        // Set up Redis subscriber asynchronously to avoid blocking initial response
        const setupRedisSubscriber = async () => {
          try {
            // Add timeout for Redis connection (5 seconds max)
            const redisTimeout = setTimeout(() => {
              console.warn('Redis subscriber setup timed out after 5 seconds');
              sendEvent({ type: 'realtime.degraded', reason: 'redis_timeout' });
            }, 5000);

            subscriber = await getRedisSubscriber();
            clearTimeout(redisTimeout);

            if (!subscriber) {
              console.warn('Redis subscriber not available, running in degraded mode');
              sendEvent({ type: 'realtime.degraded', reason: 'redis_unavailable' });
              return;
            }

            // Subscribe to Redis channel
            await subscriber.subscribe(channel, (message: string) => {
              try {
                // Ensure message is defined and not null
                if (message && typeof message === 'string') {
                  const parsed = JSON.parse(message);
                  sendEvent(parsed);
                }
              } catch (parseError) {
                // Handle parsing errors gracefully
                if (message) {
                  sendEvent({ type: 'message', message: String(message) });
                }
              }
            });

            isRedisConnected = true;
            sendEvent({ type: 'realtime.ready', channel });
            console.log(`SSE Redis subscriber connected for workspace ${workspaceId}`);
          } catch (error) {
            console.error('Error setting up Redis subscriber:', error);
            sendEvent({ type: 'realtime.error', error: 'Failed to connect to Redis' });
          }
        };

        // Start Redis setup asynchronously (don't await)
        setupRedisSubscriber();

        const onClose = async () => {
          clearInterval(pingInterval);
          if (subscriber && isRedisConnected) {
            try {
              await subscriber.unsubscribe(channel);
              await subscriber.quit();
              console.log(`SSE Redis subscriber disconnected for workspace ${workspaceId}`);
            } catch (error) {
              console.error('Error closing Redis subscriber:', error);
            }
          }
          try {
            if (controller.desiredSize !== null) {
              controller.close();
            }
          } catch {}
        };

        // Handle client disconnect
        const signal = request.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', onClose);
        }

        // Note: ReadableStreamDefaultController doesn't have a settable error property
        // Error handling is done through try/catch blocks and the cancel callback
      },
      cancel: async () => {
        // Additional cleanup if needed
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



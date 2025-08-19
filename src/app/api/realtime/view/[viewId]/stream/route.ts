import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { getRedisSubscriber } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { viewId } = resolvedParams;

    const view = await prisma.view.findFirst({
      where: {
        id: viewId,
        OR: [
          { ownerId: user.id },
          { visibility: 'SHARED' },
          { visibility: 'WORKSPACE' }
        ]
      }
    });

    if (!view) {
      return NextResponse.json({ error: 'View not found or access denied' }, { status: 404 });
    }

    const channel = `workspace:${view.workspaceId}:events`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const subscriber = await getRedisSubscriber();
        if (!subscriber) {
          const interval = setInterval(() => {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }, 25000);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'realtime.disabled' })}\n\n`));
          const signal = request.signal as AbortSignal | undefined;
          if (signal) signal.addEventListener('abort', () => { clearInterval(interval); controller.close(); });
          return;
        }

        const sendEvent = (data: Record<string, unknown>) => {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        sendEvent({ type: 'connected', channel, viewId });

        await subscriber.subscribe(channel, (message) => {
          try {
            const parsed = JSON.parse(message);
            // Filter to only view-related updates
            if (parsed?.type === 'view.issue-position.updated' && parsed.viewId === viewId) {
              sendEvent(parsed);
            }
            if (parsed?.type === 'issue.updated') {
              sendEvent(parsed);
            }
          } catch {
            // Ignore malformed messages
          }
        });

        const pingInterval = setInterval(() => {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 25000);

        const onClose = async () => {
          clearInterval(pingInterval);
          try { await subscriber.unsubscribe(channel); } catch {}
          try { await subscriber.quit(); } catch {}
          controller.close();
        };

        const signal = request.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', onClose);
        }
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
    console.error('SSE view stream error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}




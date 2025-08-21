import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { getRedisSubscriber } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
        const subscriber = await getRedisSubscriber();
        if (!subscriber) {
          // If Redis not available, open a stream that only pings
          const interval = setInterval(() => {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }, 25000);
          // Immediately notify disabled state
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'realtime.disabled' })}\n\n`));
          const signal = request.signal as AbortSignal | undefined;
          if (signal) signal.addEventListener('abort', () => { clearInterval(interval); controller.close(); });
          return;
        }

        const sendEvent = (data: Record<string, unknown>) => {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        // Initial ping to open the stream
        sendEvent({ type: 'connected', channel });

        await subscriber.subscribe(channel, (message) => {
          try {
            const parsed = JSON.parse(message);
            sendEvent(parsed);
          } catch {
            sendEvent({ type: 'message', message });
          }
        });

        // Keep-alive pings
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            // ignore
          }
        }, 25000);

        const onClose = async () => {
          clearInterval(pingInterval);
          try {
            await subscriber.unsubscribe(channel);
          } catch {}
          try {
            await subscriber.quit();
          } catch {}
          controller.close();
        };

        // Close on client abort
        const signal = request.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', onClose);
        }
      },
      cancel: () => {
        // Handled in onClose
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



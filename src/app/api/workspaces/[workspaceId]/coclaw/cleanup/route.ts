import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * POST /api/workspaces/[workspaceId]/coclaw/cleanup
 *
 * Deletes Coclaw noise notes — raw conversation messages that were mistakenly
 * stored as notes by older versions of Coclaw's CollabMemory backend.
 *
 * Targets notes whose titles match known auto-generated key patterns:
 *   - user_msg_*
 *   - assistant_resp_*
 *   - webhook_msg_*
 *   - api_chat_msg_*
 *   - telegram_*
 *
 * These are NOT meaningful memories — they're raw message logs that pollute
 * the notes page. Real AI memories (stored via memory_store tool with Core
 * category) have descriptive titles and isAiContext=true.
 *
 * Safety: Only deletes notes where isAiContext=false AND title matches a
 * noise pattern. Never touches user-created notes or real AI context.
 */
export async function POST(
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

    // Find noise notes — auto-generated message logs, NOT real AI context
    const noisePatterns = [
      'user_msg_%',
      'assistant_resp_%',
      'webhook_msg_%',
      'api_chat_msg_%',
      'telegram_%',
    ];

    // Count before deletion
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Note"
      WHERE "workspaceId" = ${workspaceId}
        AND "isAiContext" = false
        AND (
          "title" LIKE 'user_msg_%'
          OR "title" LIKE 'assistant_resp_%'
          OR "title" LIKE 'webhook_msg_%'
          OR "title" LIKE 'api_chat_msg_%'
          OR "title" LIKE 'telegram_%'
        )
    `;

    const noiseCount = Number(countResult[0]?.count ?? 0);

    if (noiseCount === 0) {
      return NextResponse.json({
        deleted: 0,
        message: 'No noise notes found — notes page is clean.',
      });
    }

    // Delete noise notes
    const deleteResult = await prisma.$executeRaw`
      DELETE FROM "Note"
      WHERE "workspaceId" = ${workspaceId}
        AND "isAiContext" = false
        AND (
          "title" LIKE 'user_msg_%'
          OR "title" LIKE 'assistant_resp_%'
          OR "title" LIKE 'webhook_msg_%'
          OR "title" LIKE 'api_chat_msg_%'
          OR "title" LIKE 'telegram_%'
        )
    `;

    console.log(`[coclaw/cleanup] Deleted ${deleteResult} noise notes from workspace ${workspaceId}`);

    return NextResponse.json({
      deleted: deleteResult,
      message: `Cleaned up ${deleteResult} noise notes from the notes page.`,
    });
  } catch (error) {
    console.error('[coclaw/cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Failed to clean up notes' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/workspaces/[workspaceId]/coclaw/cleanup
 *
 * Preview: Returns the count and sample of noise notes that would be deleted.
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

    // Count noise notes
    const noiseNotes = await prisma.note.findMany({
      where: {
        workspaceId,
        isAiContext: false,
        OR: [
          { title: { startsWith: 'user_msg_' } },
          { title: { startsWith: 'assistant_resp_' } },
          { title: { startsWith: 'webhook_msg_' } },
          { title: { startsWith: 'api_chat_msg_' } },
          { title: { startsWith: 'telegram_' } },
        ],
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Sample for preview
    });

    const totalCount = await prisma.note.count({
      where: {
        workspaceId,
        isAiContext: false,
        OR: [
          { title: { startsWith: 'user_msg_' } },
          { title: { startsWith: 'assistant_resp_' } },
          { title: { startsWith: 'webhook_msg_' } },
          { title: { startsWith: 'api_chat_msg_' } },
          { title: { startsWith: 'telegram_' } },
        ],
      },
    });

    return NextResponse.json({
      total: totalCount,
      sample: noiseNotes.map((n) => ({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[coclaw/cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Failed to preview cleanup' },
      { status: 500 },
    );
  }
}

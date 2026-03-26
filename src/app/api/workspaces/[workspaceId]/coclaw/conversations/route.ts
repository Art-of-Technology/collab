import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/conversations
 *
 * Returns Coclaw conversations grouped by conversationId from CoclawChannelMessage.
 * This is the real conversation history for the current user's Coclaw instance.
 *
 * Query params:
 *   - limit: number (default: 30, max: 100)
 *   - offset: number (default: 0)
 */
export async function GET(
  request: NextRequest,
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

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get distinct conversationIds with their latest message, message count, and first message for title
    const conversations = await prisma.$queryRaw<Array<{
      conversationId: string;
      messageCount: bigint;
      firstUserMessage: string | null;
      lastContent: string | null;
      lastRole: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>>`
      SELECT
        "conversationId",
        COUNT(*)::bigint AS "messageCount",
        (
          SELECT content FROM "CoclawChannelMessage" m2
          WHERE m2."conversationId" = m1."conversationId"
            AND m2."userId" = ${session.user.id}
            AND m2."workspaceId" = ${workspaceId}
            AND m2.role = 'user'
          ORDER BY m2."createdAt" ASC
          LIMIT 1
        ) AS "firstUserMessage",
        (
          SELECT content FROM "CoclawChannelMessage" m3
          WHERE m3."conversationId" = m1."conversationId"
            AND m3."userId" = ${session.user.id}
            AND m3."workspaceId" = ${workspaceId}
          ORDER BY m3."createdAt" DESC
          LIMIT 1
        ) AS "lastContent",
        (
          SELECT role FROM "CoclawChannelMessage" m4
          WHERE m4."conversationId" = m1."conversationId"
            AND m4."userId" = ${session.user.id}
            AND m4."workspaceId" = ${workspaceId}
          ORDER BY m4."createdAt" DESC
          LIMIT 1
        ) AS "lastRole",
        MIN("createdAt") AS "createdAt",
        MAX("updatedAt") AS "updatedAt"
      FROM "CoclawChannelMessage" m1
      WHERE "userId" = ${session.user.id}
        AND "workspaceId" = ${workspaceId}
        AND "conversationId" IS NOT NULL
      GROUP BY "conversationId"
      ORDER BY MAX("updatedAt") DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count of conversations
    const totalResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "conversationId")::bigint AS count
      FROM "CoclawChannelMessage"
      WHERE "userId" = ${session.user.id}
        AND "workspaceId" = ${workspaceId}
        AND "conversationId" IS NOT NULL
    `;

    const total = Number(totalResult[0]?.count ?? 0);

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.conversationId,
        title: c.firstUserMessage
          ? c.firstUserMessage.substring(0, 120)
          : 'Untitled conversation',
        messageCount: Number(c.messageCount),
        lastMessage: c.lastContent
          ? {
              content: c.lastContent.substring(0, 200),
              role: c.lastRole || 'user',
              createdAt: c.updatedAt.toISOString(),
            }
          : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[coclaw/conversations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 },
    );
  }
}

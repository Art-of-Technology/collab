import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/coclaw/memory
 *
 * Returns Coclaw-specific memories: notes that are AI context (isAiContext=true)
 * or ARCHITECTURE type, scoped to the workspace. These are the meaningful
 * decisions, architecture notes, and stored facts — NOT raw conversation messages.
 *
 * Query params:
 *   - limit: number (default: 50, max: 200)
 *   - search: string (optional search query)
 *   - category: 'all' | 'architecture' | 'ai-context' | 'core' (default: 'all')
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const search = searchParams.get('search');
    const category = searchParams.get('category') || 'all';

    // Build where clause: only meaningful Coclaw memories, not raw messages
    const where: Record<string, unknown> = {
      workspaceId,
      OR: [
        { isAiContext: true },
        { type: 'ARCHITECTURE' },
      ],
    };

    // Apply search filter
    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    // Apply category filter
    if (category === 'architecture') {
      where.type = 'ARCHITECTURE';
    } else if (category === 'ai-context') {
      where.isAiContext = true;
    }

    const memories = await prisma.note.findMany({
      where,
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        scope: true,
        isAiContext: true,
        aiContextPriority: true,
        createdAt: true,
        updatedAt: true,
        tags: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: [
        { aiContextPriority: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: limit,
    });

    // Get total count for pagination
    const total = await prisma.note.count({ where });

    return NextResponse.json({
      memories: memories.map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content.substring(0, 500), // Truncate for list view
        fullContent: m.content,
        type: m.type,
        scope: m.scope,
        isAiContext: m.isAiContext,
        priority: m.aiContextPriority,
        tags: m.tags,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      total,
    });
  } catch (error) {
    console.error('[coclaw/memory] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 },
    );
  }
}

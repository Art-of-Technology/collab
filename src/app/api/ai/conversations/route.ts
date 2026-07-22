import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/ai/conversations?workspaceId=...&agentSlug=...&conversationId=...&includeMessages=true&limit=20
 *
 * Returns per-agent conversation history.
 * - If conversationId provided: returns that conversation with all messages
 * - If agentSlug provided: returns conversations for that agent, with latest messages if requested
 * - Otherwise: returns all conversations for the workspace
 */
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const agentSlug = searchParams.get('agentSlug');
    const conversationId = searchParams.get('conversationId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const includeMessages = searchParams.get('includeMessages') === 'true';

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Verify workspace membership
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId: currentUser.id } },
      },
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // If loading a specific conversation by ID
    if (conversationId) {
      const conversation = await prisma.aIConversation.findFirst({
        where: {
          id: conversationId,
          userId: currentUser.id,
          workspaceId,
          isArchived: false,
        },
        include: {
          agent: { select: { slug: true, name: true, color: true, avatar: true } },
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              role: true,
              content: true,
              agentId: true,
              createdAt: true,
            },
          },
        },
      });

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      return NextResponse.json({ conversation });
    }

    // Resolve agent ID from slug if provided
    let agentId: string | undefined;
    if (agentSlug) {
      const agent = await prisma.aIAgent.findUnique({
        where: { slug: agentSlug },
        select: { id: true },
      });
      agentId = agent?.id;
      if (!agentId) {
        // Agent slug not found in DB — return empty
        return NextResponse.json({ conversations: [], latestConversation: null });
      }
    }

    // Build where clause
    const where: Record<string, unknown> = {
      userId: currentUser.id,
      workspaceId,
      isArchived: false,
    };
    if (agentId) {
      where.agentId = agentId;
    }

    // Fetch recent conversations
    const conversations = await prisma.aIConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        agent: { select: { slug: true, name: true, color: true, avatar: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });

    // Load messages for the latest conversation when requested
    let latestConversation = null;
    if (includeMessages && conversations.length > 0) {
      const latest = conversations[0];
      const messages = await prisma.aIMessage.findMany({
        where: { conversationId: latest.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          agentId: true,
          createdAt: true,
        },
      });
      latestConversation = {
        id: latest.id,
        title: latest.title,
        agent: latest.agent,
        messageCount: latest._count.messages,
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
        messages,
      };
    }

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        agent: c.agent,
        messageCount: c._count.messages,
        lastMessage: c.messages[0] || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      latestConversation,
    });
  } catch (error) {
    console.error('[api/ai/conversations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ai/conversations
 * Create a new conversation for an agent.
 */
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, agentSlug, title } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Find agent
    let agentId: string | null = null;
    if (agentSlug) {
      const agent = await prisma.aIAgent.findUnique({
        where: { slug: agentSlug },
        select: { id: true },
      });
      agentId = agent?.id || null;
    }

    const conversation = await prisma.aIConversation.create({
      data: {
        userId: currentUser.id,
        workspaceId,
        agentId,
        title: title || 'New conversation',
      },
      include: {
        agent: {
          select: {
            slug: true,
            name: true,
            color: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      agent: conversation.agent,
      createdAt: conversation.createdAt,
    });
  } catch (error) {
    console.error('[api/ai/conversations] Error creating:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 },
    );
  }
}

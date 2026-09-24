import type { Prisma } from '@prisma/client';
/**
 * Coclaw Channel Messages API
 *
 * This endpoint acts as the message bus between Collab web UI and the Coclaw
 * Collab channel. It supports:
 *
 * GET  - Fetch pending/all messages for a user (polled by Coclaw channel)
 * POST - Submit a new message (from Coclaw assistant responses OR user messages from UI)
 * PATCH - Acknowledge a message as delivered (called by Coclaw after pickup)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateAppRequest } from '@/lib/apps/auth-middleware';

/**
 * GET /api/coclaw/channel/[userId]/messages
 *
 * Query params:
 *  - status: 'pending' | 'delivered' | 'all' (default: 'pending')
 *  - workspaceId: required
 *  - limit: number (default: 50)
 *  - conversationId: optional filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const auth = await authenticateAppRequest(request);
  if (!auth.success || auth.context?.user.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') || 'pending';
  const workspaceId = searchParams.get('workspaceId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const conversationId = searchParams.get('conversationId');
  const role = searchParams.get('role'); // 'user' | 'assistant' | null (all)

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'workspaceId query parameter is required' },
      { status: 400 }
    );
  }

  if (workspaceId !== auth.context!.workspace.id) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 403 });
  }

  const where: Record<string, unknown> = {
    userId,
    workspaceId,
  };

  // Filter by role: Coclaw polls with role=user, UI fetches without role filter
  if (role) {
    where.role = role;
  }

  if (status !== 'all') {
    where.status = status.toUpperCase();
  }

  if (conversationId) {
    where.conversationId = conversationId;
  }

  const messages = await prisma.coclawChannelMessage.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      conversation_id: m.conversationId,
      role: m.role,
      status: m.status,
      created_at: m.createdAt.toISOString(),
      metadata: m.metadata,
    })),
  });
}

/**
 * POST /api/coclaw/channel/[userId]/messages
 *
 * Body: { content: string, role: 'user' | 'assistant', conversation_id?: string, workspace_id: string, metadata?: object }
 *
 * Used by:
 *  - Collab stream route: posts user messages for Coclaw to pick up
 *  - Coclaw channel send(): posts assistant responses back
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const auth = await authenticateAppRequest(request);
  if (!auth.success || auth.context?.user.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    content: string;
    role: string;
    conversation_id?: string;
    workspace_id?: string;
    metadata?: Prisma.InputJsonObject;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return NextResponse.json(
      { error: 'content is required and must be non-empty' },
      { status: 400 }
    );
  }

  if (!body.workspace_id) {
    return NextResponse.json(
      { error: 'workspace_id is required' },
      { status: 400 }
    );
  }

  if (body.workspace_id !== auth.context!.workspace.id) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 403 });
  }

  const role = body.role === 'assistant' ? 'assistant' : 'user';

  // User messages start as PENDING (waiting for Coclaw to pick up)
  // Assistant messages are immediately DELIVERED (they're responses from Coclaw)
  const status = role === 'user' ? 'PENDING' : 'DELIVERED';

  const message = await prisma.coclawChannelMessage.create({
    data: {
      userId,
      workspaceId: body.workspace_id,
      conversationId: body.conversation_id || null,
      role,
      content: body.content.trim(),
      status,
      metadata: body.metadata || undefined,
    },
  });

  return NextResponse.json({
    id: message.id,
    status: message.status,
    created_at: message.createdAt.toISOString(),
  }, { status: 201 });
}

/**
 * PATCH /api/coclaw/channel/[userId]/messages
 *
 * Body: { message_id: string, status: 'DELIVERED' | 'FAILED' }
 *
 * Called by Coclaw channel to acknowledge message pickup.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const auth = await authenticateAppRequest(request);
  if (!auth.success || auth.context?.user.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { message_id: string; status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.message_id) {
    return NextResponse.json(
      { error: 'message_id is required' },
      { status: 400 }
    );
  }

  const validStatuses = ['DELIVERED', 'FAILED'];
  const newStatus = body.status?.toUpperCase();
  if (!newStatus || !validStatuses.includes(newStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.coclawChannelMessage.updateMany({
      where: {
        id: body.message_id,
        userId,
        workspaceId: auth.context!.workspace.id,
      },
      data: {
        status: newStatus as 'DELIVERED' | 'FAILED',
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[coclaw-channel] Failed to update message:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}

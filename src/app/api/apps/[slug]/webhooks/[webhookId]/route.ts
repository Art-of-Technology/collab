import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getAuthSession } from '@/lib/auth';
import { z } from 'zod';
import { 
  isValidWebhookUrl, 
  validateEventTypes,
} from '@/lib/webhooks';

const prisma = new PrismaClient();

const UpdateWebhookSchema = z.object({
  url: z.string().url('Invalid webhook URL').optional(),
  eventTypes: z.array(z.string()).min(1, 'At least one event type is required').optional(),
  isActive: z.boolean().optional()
});

/**
 * GET /api/apps/[slug]/webhooks/[webhookId] - Get webhook details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; webhookId: string }> }
) {
  try {
    const { slug, webhookId } = await params;
    const session = await getAuthSession();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find webhook
    const webhook = await prisma.appWebhook.findUnique({
      where: { id: webhookId },
      include: {
        app: true,
        installation: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            eventType: true,
            eventId: true,
            httpStatus: true,
            attempts: true,
            deliveredAt: true,
            failedAt: true,
            lastAttemptAt: true,
            nextAttemptAt: true,
            createdAt: true
          }
        }
      }
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Verify app slug matches
    if (webhook.app.slug !== slug) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Verify workspace matches
    if (webhook.installation.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({
      webhook: {
        id: webhook.id,
        url: webhook.url,
        eventTypes: webhook.eventTypes,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        recentDeliveries: webhook.deliveries
      }
    });

  } catch (error: any) {
    console.error('Error getting webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/apps/[slug]/webhooks/[webhookId] - Update webhook
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; webhookId: string }> }
) {
  try {
    const { slug, webhookId } = await params;
    const session = await getAuthSession();
    const body = await request.json();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate request body
    const validation = UpdateWebhookSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { url, eventTypes, isActive } = validation.data;

    // Validate webhook URL if provided
    if (url && !isValidWebhookUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid webhook URL. Must be HTTPS in production.' },
        { status: 400 }
      );
    }

    // Validate event types if provided
    if (eventTypes && !validateEventTypes(eventTypes)) {
      return NextResponse.json(
        { error: 'Invalid event types' },
        { status: 400 }
      );
    }

    // Find webhook with workspace verification
    const webhook = await prisma.appWebhook.findUnique({
      where: { id: webhookId },
      include: {
        app: true,
        installation: {
          include: {
            workspace: true
          }
        }
      }
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Verify app slug matches
    if (webhook.app.slug !== slug) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId: webhook.installation.workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check for URL conflicts if URL is being changed
    if (url && url !== webhook.url) {
      const existingWebhook = await prisma.appWebhook.findUnique({
        where: {
          installationId_url: {
            installationId: webhook.installationId,
            url
          }
        }
      });

      if (existingWebhook) {
        return NextResponse.json(
          { error: 'Webhook URL already exists for this installation' },
          { status: 409 }
        );
      }
    }

    // Update webhook
    const updatedWebhook = await prisma.appWebhook.update({
      where: { id: webhookId },
      data: {
        ...(url && { url }),
        ...(eventTypes && { eventTypes }),
        ...(isActive !== undefined && { isActive })
      },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`🪝 Webhook: Updated webhook ${webhookId}`, {
      appSlug: slug,
      workspaceId: webhook.installation.workspaceId,
      changes: { url, eventTypes, isActive },
      userId: session.user.id
    });

    return NextResponse.json({ webhook: updatedWebhook });

  } catch (error: any) {
    console.error('Error updating webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/apps/[slug]/webhooks/[webhookId] - Delete webhook
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; webhookId: string }> }
) {
  try {
    const { slug, webhookId } = await params;
    const session = await getAuthSession();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find and verify webhook
    const webhook = await prisma.appWebhook.findUnique({
      where: { id: webhookId },
      include: {
        app: true,
        installation: true
      }
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Verify app slug and workspace
    if (webhook.app.slug !== slug || webhook.installation.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    // Delete webhook (deliveries will be cascade deleted)
    await prisma.appWebhook.delete({
      where: { id: webhookId }
    });

    console.log(`🪝 Webhook: Deleted webhook ${webhookId}`, {
      appSlug: slug,
      workspaceId,
      url: webhook.url,
      userId: session.user.id
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

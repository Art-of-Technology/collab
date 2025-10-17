import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getAuthSession } from '@/lib/auth';
import { z } from 'zod';
import { WebhookEvent } from '@/lib/webhooks';
import { processWebhookEvent } from '@/lib/webhook-delivery';

const prisma = new PrismaClient();

const TestWebhookSchema = z.object({
  workspaceId: z.string().cuid('Invalid workspace ID'),
  eventType: z.string().min(1, 'Event type is required'),
  testData: z.object({}).optional()
});

/**
 * POST /api/apps/[slug]/webhooks/test - Send test webhook
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = await getAuthSession();
    const body = await request.json();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate request body
    const validation = TestWebhookSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { workspaceId, eventType, testData } = validation.data;

    // Check workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId
        }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find the app and installation
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        installations: {
          where: { 
            workspaceId,
            status: 'ACTIVE'
          },
          include: {
            workspace: true,
            webhooks: {
              where: {
                isActive: true,
                eventTypes: {
                  has: eventType
                }
              }
            }
          }
        }
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const installation = app.installations[0];
    if (!installation) {
      return NextResponse.json({ error: 'App not installed in this workspace' }, { status: 404 });
    }

    const activeWebhooks = installation.webhooks;
    if (activeWebhooks.length === 0) {
      return NextResponse.json(
        { error: `No active webhooks found for event type: ${eventType}` },
        { status: 404 }
      );
    }

    // Create test event
    const testEvent: WebhookEvent = {
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      type: eventType,
      timestamp: Date.now(),
      data: testData || createTestEventData(eventType),
      workspace: {
        id: installation.workspace.id,
        slug: installation.workspace.slug,
        name: installation.workspace.name
      },
      app: {
        id: app.id,
        slug: app.slug,
        name: app.name
      }
    };

    console.log(`🪝 Webhook: Sending test event`, {
      eventId: testEvent.id,
      eventType,
      appSlug: slug,
      workspaceId,
      webhookCount: activeWebhooks.length,
      userId: session.user.id
    });

    // Process the test event (this will deliver to all matching webhooks)
    await processWebhookEvent(testEvent, {
      maxAttempts: 1, // Don't retry test webhooks
      timeoutMs: 5000 // Shorter timeout for tests
    });

    // Get delivery results
    const deliveries = await prisma.appWebhookDelivery.findMany({
      where: {
        eventId: testEvent.id,
        webhook: {
          installationId: installation.id
        }
      },
      include: {
        webhook: {
          select: {
            id: true,
            url: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      testEvent: {
        id: testEvent.id,
        type: testEvent.type,
        timestamp: testEvent.timestamp
      },
      deliveries: deliveries.map(delivery => ({
        webhookId: delivery.webhook.id,
        webhookUrl: delivery.webhook.url,
        httpStatus: delivery.httpStatus,
        success: !!delivery.deliveredAt,
        error: delivery.responseBody,
        attempts: delivery.attempts,
        deliveredAt: delivery.deliveredAt,
        failedAt: delivery.failedAt
      })),
      summary: {
        totalWebhooks: activeWebhooks.length,
        successful: deliveries.filter(d => d.deliveredAt).length,
        failed: deliveries.filter(d => d.failedAt || (!d.deliveredAt && d.attempts > 0)).length
      }
    });

  } catch (error: any) {
    console.error('Error sending test webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Create sample test data for different event types
 */
function createTestEventData(eventType: string): any {
  const baseData = {
    id: `test_${Math.random().toString(36).substr(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  switch (eventType) {
    case 'issue.created':
    case 'issue.updated':
      return {
        issue: {
          ...baseData,
          title: 'Test Issue for Webhook',
          description: 'This is a test issue created for webhook testing purposes.',
          status: 'OPEN',
          priority: 'MEDIUM',
          type: 'TASK',
          assigneeId: null,
          reporterId: 'test_user_id',
          projectId: 'test_project_id',
          labels: ['test', 'webhook']
        }
      };
      
    case 'post.created':
    case 'post.updated':
      return {
        post: {
          ...baseData,
          content: 'This is a test post created for webhook testing purposes.',
          authorId: 'test_user_id',
          workspaceId: 'test_workspace_id',
          tags: ['test', 'webhook']
        }
      };

    case 'workspace.member_added':
      return {
        member: {
          userId: 'test_user_id',
          workspaceId: 'test_workspace_id',
          role: 'MEMBER',
          invitedById: 'test_admin_id',
          joinedAt: new Date().toISOString()
        }
      };

    case 'workspace.member_removed':
      return {
        member: {
          userId: 'test_user_id',
          workspaceId: 'test_workspace_id',
          role: 'MEMBER',
          removedById: 'test_admin_id',
          removedAt: new Date().toISOString()
        }
      };

    case 'app.installed':
      return {
        installation: {
          ...baseData,
          appId: 'test_app_id',
          workspaceId: 'test_workspace_id',
          installedById: 'test_admin_id',
          status: 'ACTIVE',
          scopes: ['workspace:read', 'issues:read']
        }
      };

    case 'app.uninstalled':
      return {
        installation: {
          ...baseData,
          appId: 'test_app_id',
          workspaceId: 'test_workspace_id',
          uninstalledById: 'test_admin_id',
          uninstalledAt: new Date().toISOString()
        }
      };

    default:
      return {
        message: `Test event for ${eventType}`,
        timestamp: Date.now(),
        testData: true
      };
  }
}

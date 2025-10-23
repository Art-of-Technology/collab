import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getAuthSession } from '@/lib/auth';
import { z } from 'zod';
import { 
  generateWebhookSecret, 
  isValidWebhookUrl, 
  validateEventTypes,
  WEBHOOK_EVENT_TYPES 
} from '@/lib/webhooks';
import { encrypt } from '@/lib/apps/crypto';

const prisma = new PrismaClient();

const CreateWebhookSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  eventTypes: z.array(z.string()).min(1, 'At least one event type is required'),
  workspaceId: z.string().cuid('Invalid workspace ID')
});

const UpdateWebhookSchema = z.object({
  url: z.string().url('Invalid webhook URL').optional(),
  eventTypes: z.array(z.string()).min(1, 'At least one event type is required').optional(),
  isActive: z.boolean().optional()
});

/**
 * GET /api/apps/[slug]/webhooks - List webhooks for an app installation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = await getAuthSession();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    // Find the app
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        installations: {
          where: { workspaceId },
          include: {
            webhooks: {
              select: {
                id: true,
                url: true,
                eventTypes: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                  select: {
                    deliveries: true
                  }
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

    return NextResponse.json({
      webhooks: installation.webhooks,
      availableEventTypes: WEBHOOK_EVENT_TYPES
    });

  } catch (error: any) {
    console.error('Error listing webhooks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/apps/[slug]/webhooks - Create a webhook for an app installation
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
    const validation = CreateWebhookSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { url, eventTypes, workspaceId } = validation.data;

    // Validate webhook URL
    if (!isValidWebhookUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid webhook URL. Must be HTTPS in production.' },
        { status: 400 }
      );
    }

    // Validate event types
    if (!validateEventTypes(eventTypes)) {
      return NextResponse.json(
        { 
          error: 'Invalid event types', 
          availableTypes: WEBHOOK_EVENT_TYPES 
        },
        { status: 400 }
      );
    }

    // Find the app and installation
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        installations: {
          where: { workspaceId }
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

    // Check workspace membership and admin role
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

    // Check if webhook URL already exists for this installation
    const existingWebhook = await prisma.appWebhook.findUnique({
      where: {
        installationId_url: {
          installationId: installation.id,
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

    // Generate webhook secret
    const secret = generateWebhookSecret();
    const encryptedSecret = await encrypt(secret);

    // Create webhook
    const webhook = await prisma.appWebhook.create({
      data: {
        appId: app.id,
        installationId: installation.id,
        url,
        secretEnc: encryptedSecret,
        eventTypes,
        isActive: true
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

    console.log(`🪝 Webhook: Created webhook for app ${slug}`, {
      webhookId: webhook.id,
      url,
      eventTypes,
      workspaceId,
      userId: session.user.id
    });

    return NextResponse.json({
      webhook,
      secret // Return secret only once during creation
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

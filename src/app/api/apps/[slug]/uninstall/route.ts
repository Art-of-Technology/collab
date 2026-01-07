import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getAuthSession } from '@/lib/auth';
import { z } from 'zod';
import { emitAppUninstalled } from '@/lib/event-bus';

const prisma = new PrismaClient();

const UninstallAppSchema = z.object({
  workspaceId: z.string().cuid('Invalid workspace ID')
});

/**
 * POST /api/apps/[slug]/uninstall - Uninstall app from workspace
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
    const validation = UninstallAppSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { workspaceId } = validation.data;

    // Find the app
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        installations: {
          where: { workspaceId },
          include: {
            webhooks: true
          }
        }
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Prevent uninstalling system apps
    if (app.isSystemApp) {
      return NextResponse.json(
        { error: 'System apps cannot be uninstalled' },
        { status: 403 }
      );
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
      },
      include: {
        workspace: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Perform uninstallation in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete webhook deliveries first (due to foreign key constraints)
      const webhookIds = installation.webhooks.map(w => w.id);
      if (webhookIds.length > 0) {
        await tx.appWebhookDelivery.deleteMany({
          where: {
            webhookId: {
              in: webhookIds
            }
          }
        });
      }

      // Delete webhooks
      await tx.appWebhook.deleteMany({
        where: {
          installationId: installation.id
        }
      });

      // Update installation status to REMOVED instead of deleting
      // This preserves audit trail while marking as uninstalled
      await tx.appInstallation.update({
        where: {
          id: installation.id
        },
        data: {
          status: 'REMOVED',
          updatedAt: new Date()
        }
      });
    });

    console.log(`🗑️  App: Uninstalled ${app.name} from workspace ${workspaceId}`, {
      appId: app.id,
      appSlug: app.slug,
      workspaceId,
      userId: session.user.id,
      installationId: installation.id
    });

    // Emit webhook event for app uninstallation
    try {
      await emitAppUninstalled(
        {
          id: installation.id,
          appId: app.id,
          workspaceId,
          status: 'REMOVED',
          app: {
            id: app.id,
            name: app.name,
            slug: app.slug
          }
        },
        {
          userId: session.user.id,
          workspaceId,
          workspaceName: membership.workspace.name,
          workspaceSlug: membership.workspace.slug,
          source: 'api'
        },
        { async: true }
      );
    } catch (webhookError) {
      console.warn('[APP_UNINSTALL_WEBHOOK]', webhookError);
    }

    return NextResponse.json({
      success: true,
      message: `${app.name} has been uninstalled successfully`
    });

  } catch (error: any) {
    console.error('Error uninstalling app:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * DELETE /api/apps/[slug]/delete - Delete an app
 * Only the app owner/publisher can delete the app
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the app
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        installations: true,
        oauthClient: true,
        scopes: true,
        versions: true,
        webhooks: true
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Check if user is the publisher/owner of the app
    if (app.publisherId !== session.user.id && session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json(
        { error: 'You do not have permission to delete this app' },
        { status: 403 }
      );
    }

    // Check if app has active installations
    const activeInstallations = app.installations.filter(
      inst => inst.status === 'ACTIVE' || inst.status === 'PENDING'
    );

    if (activeInstallations.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete app with active installations',
          details: `This app has ${activeInstallations.length} active installation(s). Please uninstall the app from all workspaces first.`
        },
        { status: 400 }
      );
    }

    // Delete app and all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete authorization codes
      if (app.oauthClient) {
        await tx.appOAuthAuthorizationCode.deleteMany({
          where: { clientId: app.oauthClient.clientId }
        });
      }

      // Delete webhook deliveries for all webhooks
      const webhookIds = app.webhooks.map(w => w.id);
      if (webhookIds.length > 0) {
        await tx.appWebhookDelivery.deleteMany({
          where: { webhookId: { in: webhookIds } }
        });
      }

      // Delete webhooks
      await tx.appWebhook.deleteMany({
        where: { appId: app.id }
      });

      // Delete installations (including REMOVED ones)
      await tx.appInstallation.deleteMany({
        where: { appId: app.id }
      });

      // Delete OAuth client
      if (app.oauthClient) {
        await tx.appOAuthClient.delete({
          where: { id: app.oauthClient.id }
        });
      }

      // Delete scopes
      await tx.appScope.deleteMany({
        where: { appId: app.id }
      });

      // Delete versions
      await tx.appVersion.deleteMany({
        where: { appId: app.id }
      });

      // Finally, delete the app itself
      await tx.app.delete({
        where: { id: app.id }
      });
    });

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: 'App deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting app:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


import { prisma } from '@/lib/prisma';
import { type Activity } from './RecentActivityFeed';

export async function getDashboardStats(userId: string) {
  const whereClause = {
    OR: [
      { userId },
      { publisherId: userId }
    ]
  };

  const [totalApps, draftApps, inReviewApps, publishedApps, totalInstallations] = await Promise.all([
    prisma.app.count({
      where: whereClause
    }),
    prisma.app.count({
      where: {
        AND: [
          whereClause,
          { status: 'DRAFT' }
        ]
      }
    }),
    prisma.app.count({
      where: {
        AND: [
          whereClause,
          { status: 'IN_REVIEW' }
        ]
      }
    }),
    prisma.app.count({
      where: {
        AND: [
          whereClause,
          { status: 'PUBLISHED' }
        ]
      }
    }),
    prisma.appInstallation.count({
      where: {
        app: {
          OR: [
            { userId },
            { publisherId: userId }
          ]
        }
      }
    })
  ]);
  
  return {
    totalApps,
    draftApps,
    inReviewApps,
    publishedApps,
    totalInstallations
  };
}

export async function getRecentActivities(userId: string, limit: number = 10): Promise<Activity[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const appWhereClause = {
    OR: [
      { userId },
      { publisherId: userId }
    ]
  };

  const [installations, webhookFailures, statusChanges] = await Promise.all([
    // New app installations
    prisma.appInstallation.findMany({
      where: {
        app: appWhereClause,
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        app: {
          select: { name: true, slug: true }
        },
        workspace: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    
    // Webhook delivery failures
    prisma.appWebhookDelivery.findMany({
      where: {
        webhook: {
          app: appWhereClause
        },
        OR: [
          { failedAt: { not: null } },
          { httpStatus: { gte: 400 } }
        ],
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        webhook: {
          include: {
            app: {
              select: { name: true, slug: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    
    // App status changes (recently updated apps with specific statuses)
    prisma.app.findMany({
      where: {
        ...appWhereClause,
        updatedAt: { gte: thirtyDaysAgo },
        status: { in: ['PUBLISHED', 'REJECTED', 'IN_REVIEW'] }
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    })
  ]);

  const activities: Activity[] = [];

  // Add installations
  installations.forEach(inst => {
    activities.push({
      id: `inst-${inst.id}`,
      type: 'installation',
      title: 'New Installation',
      description: `${inst.app.name} was installed in ${inst.workspace.name}`,
      timestamp: inst.createdAt.toISOString(),
      appName: inst.app.name,
      appSlug: inst.app.slug
    });
  });

  // Add webhook failures
  webhookFailures.forEach(delivery => {
    const timestamp = delivery.failedAt || delivery.createdAt;
    activities.push({
      id: `webhook-${delivery.id}`,
      type: 'webhook_failure',
      title: 'Webhook Delivery Failed',
      description: `Failed to deliver webhook for ${delivery.webhook.app.name}`,
      timestamp: timestamp.toISOString(),
      appName: delivery.webhook.app.name,
      appSlug: delivery.webhook.app.slug
    });
  });

  // Add status changes
  statusChanges.forEach(app => {
    let title = 'App Status Changed';
    let description = `${app.name} status updated`;
    
    if (app.status === 'PUBLISHED') {
      title = 'App Approved';
      description = `${app.name} was published`;
    } else if (app.status === 'REJECTED') {
      title = 'App Rejected';
      description = `${app.name} was rejected`;
    } else if (app.status === 'IN_REVIEW') {
      title = 'App In Review';
      description = `${app.name} is under review`;
    }

    activities.push({
      id: `status-${app.id}-${app.updatedAt.getTime()}`,
      type: 'status_change',
      title,
      description,
      timestamp: app.updatedAt.toISOString(),
      appName: app.name,
      appSlug: app.slug,
      status: app.status
    });
  });

  // Sort by timestamp and limit
  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}


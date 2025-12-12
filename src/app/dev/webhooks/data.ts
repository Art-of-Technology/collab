import { prisma } from '@/lib/prisma';

export interface WebhookStats {
  totalWebhooks: number;
  activeWebhooks: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingRetries: number;
  successRate: number;
}

export interface WebhookWithStats {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  app: {
    id: string;
    name: string;
    slug: string;
  };
  installation: {
    id: string;
    workspace: {
      name: string;
    };
  };
  stats: {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    lastDeliveryAt: Date | null;
    lastDeliveryStatus: 'success' | 'failed' | 'pending' | null;
  };
}

export interface DeliveryRecord {
  id: string;
  eventType: string;
  eventId: string;
  httpStatus: number | null;
  attempts: number;
  deliveredAt: Date | null;
  failedAt: Date | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  webhook: {
    id: string;
    url: string;
    app: {
      name: string;
      slug: string;
    };
  };
}

export async function getWebhookStats(userId: string): Promise<WebhookStats> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalWebhooks, activeWebhooks, deliveries] = await Promise.all([
    // Total webhooks
    prisma.appWebhook.count({
      where: {
        app: {
          OR: [
            { userId },
            { publisherId: userId }
          ]
        }
      }
    }),
    
    // Active webhooks
    prisma.appWebhook.count({
      where: {
        app: {
          OR: [
            { userId },
            { publisherId: userId }
          ]
        },
        isActive: true
      }
    }),
    
    // Deliveries in last 30 days
    prisma.appWebhookDelivery.findMany({
      where: {
        webhook: {
          app: {
            OR: [
              { userId },
              { publisherId: userId }
            ]
          }
        },
        createdAt: { gte: thirtyDaysAgo }
      },
      select: {
        deliveredAt: true,
        failedAt: true,
        nextAttemptAt: true
      }
    })
  ]);

  const successfulDeliveries = deliveries.filter(d => d.deliveredAt !== null).length;
  const failedDeliveries = deliveries.filter(d => d.failedAt !== null).length;
  const pendingRetries = deliveries.filter(
    d => d.deliveredAt === null && d.failedAt === null && d.nextAttemptAt !== null
  ).length;
  
  const totalDeliveries = deliveries.length;
  const successRate = totalDeliveries > 0 
    ? Math.round((successfulDeliveries / totalDeliveries) * 100) 
    : 0;

  return {
    totalWebhooks,
    activeWebhooks,
    totalDeliveries,
    successfulDeliveries,
    failedDeliveries,
    pendingRetries,
    successRate
  };
}

export async function getWebhooksWithStats(userId: string): Promise<WebhookWithStats[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const webhooks = await prisma.appWebhook.findMany({
    where: {
      app: {
        OR: [
          { userId },
          { publisherId: userId }
        ]
      }
    },
    include: {
      app: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      installation: {
        include: {
          workspace: {
            select: {
              name: true
            }
          }
        }
      },
      deliveries: {
        where: {
          createdAt: { gte: thirtyDaysAgo }
        },
        select: {
          deliveredAt: true,
          failedAt: true,
          httpStatus: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
        // No take limit - we need all deliveries for stats calculation
      },
      _count: {
        select: {
          deliveries: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Get last delivery for each webhook in parallel
  const lastDeliveries = await Promise.all(
    webhooks.map(webhook =>
      prisma.appWebhookDelivery.findFirst({
        where: {
          webhookId: webhook.id
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          deliveredAt: true,
          failedAt: true,
          httpStatus: true,
          createdAt: true
        }
      })
    )
  );

  return webhooks.map((webhook, index) => {
    // Delivery stats are already filtered to last 30 days from Prisma query
    const recentDeliveries = webhook.deliveries;
    
    const successfulDeliveries = recentDeliveries.filter(d => d.deliveredAt !== null).length;
    const failedDeliveries = recentDeliveries.filter(d => d.failedAt !== null).length;
    
    // Get the most recent delivery (not filtered by date) for last delivery status
    const lastDelivery = lastDeliveries[index];
    let lastDeliveryStatus: 'success' | 'failed' | 'pending' | null = null;
    if (lastDelivery) {
      if (lastDelivery.deliveredAt) {
        lastDeliveryStatus = 'success';
      } else if (lastDelivery.failedAt) {
        lastDeliveryStatus = 'failed';
      } else {
        lastDeliveryStatus = 'pending';
      }
    }

    return {
      id: webhook.id,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
      app: webhook.app,
      installation: {
        id: webhook.installation.id,
        workspace: webhook.installation.workspace
      },
      stats: {
        totalDeliveries: webhook._count.deliveries,
        successfulDeliveries,
        failedDeliveries,
        lastDeliveryAt: lastDelivery?.createdAt || null,
        lastDeliveryStatus
      }
    };
  });
}

export async function getRecentDeliveries(
  userId: string,
  limit: number = 20
): Promise<DeliveryRecord[]> {
  const deliveries = await prisma.appWebhookDelivery.findMany({
    where: {
      webhook: {
        app: {
          OR: [
            { userId },
            { publisherId: userId }
          ]
        }
      }
    },
    include: {
      webhook: {
        include: {
          app: {
            select: {
              name: true,
              slug: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: limit
  });

  return deliveries.map(delivery => ({
    id: delivery.id,
    eventType: delivery.eventType,
    eventId: delivery.eventId,
    httpStatus: delivery.httpStatus,
    attempts: delivery.attempts,
    deliveredAt: delivery.deliveredAt,
    failedAt: delivery.failedAt,
    nextAttemptAt: delivery.nextAttemptAt,
    createdAt: delivery.createdAt,
    webhook: {
      id: delivery.webhook.id,
      url: delivery.webhook.url,
      app: delivery.webhook.app
    }
  }));
}


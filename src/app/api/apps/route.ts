import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { AppListResponse } from '@/lib/apps/types';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const publisherId = searchParams.get('publisherId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};
    if (status && ['DRAFT', 'PUBLISHED', 'SUSPENDED'].includes(status)) {
      where.status = status;
    }
    if (publisherId) {
      where.publisherId = publisherId;
    }

    // Fetch apps with pagination
    const [apps, total] = await Promise.all([
      prisma.app.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100), // Max 100 per request
        skip: offset,
        include: {
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 1 // Get latest version
          }
        }
      }),
      prisma.app.count({ where })
    ]);

    const response: AppListResponse = {
      apps: apps.map(app => ({
        id: app.id,
        name: app.name,
        slug: app.slug,
        iconUrl: app.iconUrl || undefined,
        manifestUrl: app.manifestUrl,
        publisherId: app.publisherId,
        status: app.status as 'DRAFT' | 'PUBLISHED' | 'SUSPENDED',
        latestVersion: app.versions[0]?.version,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt
      })),
      total
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching apps:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

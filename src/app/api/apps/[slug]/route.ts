import { NextRequest, NextResponse } from 'next/server';
import { AppDetailResponse } from '@/lib/apps/types';
import { getCurrentUser } from '@/lib/session';
import { appReadAccessWhere } from '@/lib/apps/ownership';

import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const actor = await getCurrentUser();

    // Fetch app with all related data
    const app = await prisma.app.findFirst({
      where: { slug, ...appReadAccessWhere(actor?.id) },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' }
        },
        oauthClient: true,
        scopes: true
      }
    });

    if (!app) {
      return NextResponse.json(
        { error: `App with slug "${slug}" not found` },
        { status: 404 }
      );
    }

    const response: AppDetailResponse = {
      app: {
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
      },
      versions: app.versions.map(version => ({
        id: version.id,
        appId: version.appId,
        version: version.version,
        manifest: version.manifest as any, // Type assertion for Prisma Json
        createdAt: version.createdAt
      })),
      oauthClient: app.oauthClient ? {
        id: app.oauthClient.id,
        appId: app.oauthClient.appId,
        clientId: app.oauthClient.clientId,
        redirectUris: app.oauthClient.redirectUris
        // Note: clientSecret is intentionally excluded from response
      } : undefined,
      scopes: app.scopes.map(s => s.scope),
      permissions: app.permissions as { org: boolean; user: boolean; }
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error('Error fetching app details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

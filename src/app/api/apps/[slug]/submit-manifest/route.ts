import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient, AppStatus } from '@prisma/client';
import { z } from 'zod';
import { fetchManifest, validateAppManifest } from '@/lib/apps/validation';
import { AppManifestV1 } from '@/lib/apps/types';

const prisma = new PrismaClient();

// Schema for submitting manifest
const SubmitManifestSchema = z.object({
  manifestUrl: z.string().url('Invalid manifest URL')
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validation = SubmitManifestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { manifestUrl } = validation.data;

    // Get the app
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        oauthClient: true,
        scopes: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Only DRAFT apps can have their manifest submitted
    if (app.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only draft apps can have their manifest submitted' },
        { status: 400 }
      );
    }

    // Fetch and validate the manifest
    let manifest: AppManifestV1;
    try {
      const manifestData = await fetchManifest(manifestUrl);
      manifest = validateAppManifest(manifestData);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Invalid manifest: ${error.message}` },
        { status: 400 }
      );
    }

    // Validate that the manifest slug matches the app slug
    if (manifest.slug !== app.slug) {
      return NextResponse.json(
        { 
          error: `Manifest slug "${manifest.slug}" does not match app slug "${app.slug}". Please update your manifest.` 
        },
        { status: 400 }
      );
    }

    // Update app and create version in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the app with manifest data
      const updatedApp = await tx.app.update({
        where: { id: app.id },
        data: {
          manifestUrl,
          iconUrl: manifest.icon_url || app.iconUrl,
          visibility: manifest.visibility.toUpperCase() as any,
          permissions: manifest.permissions,
          status: AppStatus.IN_REVIEW // Move to IN_REVIEW for admin approval
        }
      });

      // Create new version
      const version = await tx.appVersion.create({
        data: {
          appId: app.id,
          version: manifest.version,
          manifest: manifest as any
        }
      });

      // Update scopes
      await tx.appScope.deleteMany({
        where: { appId: app.id }
      });

      await tx.appScope.createMany({
        data: manifest.scopes.map(scope => ({
          appId: app.id,
          scope
        }))
      });

      // Update OAuth client with manifest configuration
      if (app.oauthClient && manifest.oauth) {
        await tx.appOAuthClient.update({
          where: { id: app.oauthClient.id },
          data: {
            redirectUris: manifest.oauth.redirect_uris || [],
            postLogoutRedirectUris: manifest.oauth.post_logout_redirect_uris || [],
            responseTypes: manifest.oauth.response_types || ['code'],
            grantTypes: manifest.oauth.grant_types || ['authorization_code', 'refresh_token']
          }
        });
      }

      return { app: updatedApp, version };
    });

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: 'Manifest submitted successfully. Your app is now under review.',
      app: {
        id: result.app.id,
        name: result.app.name,
        slug: result.app.slug,
        status: result.app.status,
        manifestUrl: result.app.manifestUrl
      },
      version: {
        id: result.version.id,
        version: result.version.version
      }
    });

  } catch (error) {
    console.error('Error submitting manifest:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


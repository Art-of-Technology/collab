import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { 
  ImportManifestRequestSchema, 
  validateAppManifest, 
  isReservedSlug, 
  validateManifestUrl 
} from '@/lib/apps/validation';
import { AppManifestV1, AppImportResponse } from '@/lib/apps/types';
import { hashSecret } from '@/lib/apps/crypto';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const { url, publisherId = 'system' } = ImportManifestRequestSchema.parse(body);
        
    // Validate manifest URL format
    if (!validateManifestUrl(url)) {
      return NextResponse.json(
        { success: false, error: 'Invalid manifest URL format' },
        { status: 400 }
      );
    }

    // Fetch manifest from URL
    let manifestResponse: Response;
    try {
      manifestResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Collab-App-Platform/1.0'
        },
        // Add timeout
        signal: AbortSignal.timeout(10000) // 10 seconds
      });

      if (!manifestResponse.ok) {
        return NextResponse.json(
          { success: false, error: `Failed to fetch manifest: ${manifestResponse.status} ${manifestResponse.statusText}` },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch manifest: ${error instanceof Error ? error.message : 'Network error'}` },
        { status: 400 }
      );
    }

    // Parse manifest JSON
    let manifestData: unknown;
    try {
      manifestData = await manifestResponse.json();
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in manifest file' },
        { status: 400 }
      );
    }

    // Validate manifest structure
    let manifest: AppManifestV1;
    try {
      manifest = validateAppManifest(manifestData);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Invalid manifest format' },
        { status: 400 }
      );
    }

    // Check for reserved slugs
    if (isReservedSlug(manifest.slug)) {
      return NextResponse.json(
        { success: false, error: `App slug "${manifest.slug}" is reserved and cannot be used` },
        { status: 400 }
      );
    }

    // Check if app with this slug already exists
    const existingApp = await prisma.app.findUnique({
      where: { slug: manifest.slug }
    });

    let app;
    let version;

    if (existingApp) {
      // Update existing app
      app = await prisma.app.update({
        where: { id: existingApp.id },
        data: {
          name: manifest.name,
          iconUrl: manifest.icon_url,
          manifestUrl: url,
          updatedAt: new Date()
        }
      });

      // Check if this version already exists
      const existingVersion = await prisma.appVersion.findFirst({
        where: {
          appId: existingApp.id,
          version: manifest.version
        }
      });

      if (existingVersion) {
        // Update existing version
        version = await prisma.appVersion.update({
          where: { id: existingVersion.id },
          data: {
            manifest: manifest as any // Prisma Json type
          }
        });
      } else {
        // Create new version
        version = await prisma.appVersion.create({
          data: {
            appId: existingApp.id,
            version: manifest.version,
            manifest: manifest as any
          }
        });
      }

      // Update scopes
      await prisma.appScope.deleteMany({
        where: { appId: existingApp.id }
      });

      await prisma.appScope.createMany({
        data: manifest.scopes.map(scope => ({
          appId: existingApp.id,
          scope
        }))
      });

      // Update permissions object
      await prisma.app.update({
        where: { id: existingApp.id },
        data: {
          permissions: manifest.permissions
        }
      });

      // Update OAuth client if provided
      if (manifest.oauth) {
        const existingOAuthClient = await prisma.appOAuthClient.findUnique({
          where: { appId: existingApp.id }
        });

        // Require both client_id and client_secret in manifest
        if (!manifest.oauth.client_id || !manifest.oauth.client_secret) {
          return NextResponse.json(
            { success: false, error: 'OAuth configuration requires both client_id and client_secret. Generate credentials first.' },
            { status: 400 }
          );
        }
        
        // Hash the client secret for secure storage
        const hashedClientSecret = await hashSecret(manifest.oauth.client_secret);

        if (existingOAuthClient) {
          await prisma.appOAuthClient.update({
            where: { id: existingOAuthClient.id },
            data: {
              clientId: manifest.oauth.client_id,
              redirectUris: manifest.oauth.redirect_uris,
              clientSecret: hashedClientSecret
            }
          });
        } else {
          await prisma.appOAuthClient.create({
            data: {
              appId: existingApp.id,
              clientId: manifest.oauth.client_id,
              redirectUris: manifest.oauth.redirect_uris,
              clientSecret: hashedClientSecret
            }
          });
        }
      }

    } else {
      // Create new app with version and permissions in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const newApp = await tx.app.create({
          data: {
            name: manifest.name,
            slug: manifest.slug,
            iconUrl: manifest.icon_url,
            manifestUrl: url,
            publisherId,
            status: 'DRAFT',
            permissions: manifest.permissions
          }
        });

        const newVersion = await tx.appVersion.create({
          data: {
            appId: newApp.id,
            version: manifest.version,
            manifest: manifest as any
          }
        });

        await tx.appScope.createMany({
          data: manifest.scopes.map(scope => ({
            appId: newApp.id,
            scope
          }))
        });


        // Create OAuth client if provided
        if (manifest.oauth) {
          // Require both client_id and client_secret in manifest
          if (!manifest.oauth.client_id || !manifest.oauth.client_secret) {
            throw new Error('OAuth configuration requires both client_id and client_secret. Generate credentials first.');
          }
          
          // Hash the client secret for secure storage
          const hashedClientSecret = await hashSecret(manifest.oauth.client_secret);
          
          await tx.appOAuthClient.create({
            data: {
              appId: newApp.id,
              clientId: manifest.oauth.client_id,
              redirectUris: manifest.oauth.redirect_uris,
              clientSecret: hashedClientSecret,
            }
          });
        }

        return { app: newApp, version: newVersion };
      });

      app = result.app;
      version = result.version;
    }

    // Return success response
    const response: AppImportResponse = {
      success: true,
      app: {
        id: app.id,
        name: app.name,
        slug: app.slug,
        iconUrl: app.iconUrl || undefined,
        manifestUrl: app.manifestUrl,
        publisherId: app.publisherId,
        status: app.status as 'DRAFT' | 'PUBLISHED' | 'SUSPENDED',
        latestVersion: version.version,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt
      },
      version: {
        id: version.id,
        appId: version.appId,
        version: version.version,
        manifest: version.manifest as unknown as AppManifestV1,
        createdAt: version.createdAt
      }
    };

    return NextResponse.json(response, { status: existingApp ? 200 : 201 });

  } catch (error) {
    console.error('Error importing manifest:', error);
    
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

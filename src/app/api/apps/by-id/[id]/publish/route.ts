import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, AppStatus } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const PublishRequestSchema = z.object({
  status: z.enum(['IN_REVIEW', 'PUBLISHED', 'DRAFT', 'SUSPENDED', 'REJECTED'], {
    errorMap: () => ({ message: 'Status must be IN_REVIEW, PUBLISHED, DRAFT, SUSPENDED, or REJECTED' })
  })
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Parse and validate request body
    const body = await request.json();
    const { status } = PublishRequestSchema.parse(body);

    // Check if app exists and get latest version
    const existingApp = await prisma.app.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        oauthClient: true
      }
    });

    if (!existingApp) {
      return NextResponse.json(
        { error: 'App not found' },
        { status: 404 }
      );
    }

    const latestVersion = existingApp.versions[0];
    if (!latestVersion) {
      return NextResponse.json(
        { error: 'App has no versions' },
        { status: 400 }
      );
    }

    const manifest = latestVersion.manifest as any;

    // Validate status transitions
    const currentStatus = existingApp.status as AppStatus;
    
    // Only allow publishing apps that are approved (not IN_REVIEW)
    if (status === 'PUBLISHED' && currentStatus === AppStatus.IN_REVIEW) {
      return NextResponse.json(
        { error: 'Cannot publish app while it is still under review. App must be approved first.' },
        { status: 403 }
      );
    }

    // Validate manifest credentials for publishing
    if (status === 'PUBLISHED' && manifest.oauth) {
      const validationResult = await validateManifestCredentials(existingApp, manifest);
      if (!validationResult.valid) {
        return NextResponse.json(
          { error: validationResult.error },
          { status: 400 }
        );
      }
    }

    // Only allow certain status transitions
    const validTransitions: Record<AppStatus, AppStatus[]> = {
      [AppStatus.DRAFT]: [AppStatus.IN_REVIEW, AppStatus.PUBLISHED], // Allow direct publish for approved apps
      [AppStatus.IN_REVIEW]: [AppStatus.PUBLISHED, AppStatus.REJECTED, AppStatus.DRAFT],
      [AppStatus.PUBLISHED]: [AppStatus.SUSPENDED, AppStatus.DRAFT],
      [AppStatus.SUSPENDED]: [AppStatus.PUBLISHED, AppStatus.DRAFT],
      [AppStatus.REJECTED]: [AppStatus.DRAFT, AppStatus.IN_REVIEW]
    };

    const targetStatus = status as AppStatus;
    if (!validTransitions[currentStatus]?.includes(targetStatus)) {
      return NextResponse.json(
        { error: `Invalid status transition from ${currentStatus} to ${targetStatus}` },
        { status: 400 }
      );
    }

    // Use transaction to update app status
    const result = await prisma.$transaction(async (tx) => {

      // Update app status
      const updatedApp = await tx.app.update({
        where: { id },
        data: { 
          status,
          updatedAt: new Date()
        }
      });

      return updatedApp;
    });

    return NextResponse.json({
      success: true,
      app: {
        id: result.id,
        name: result.name,
        slug: result.slug,
        status: result.status,
        updatedAt: result.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating app status:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Validate that manifest credentials match the generated OAuth client
async function validateManifestCredentials(app: any, manifest: any): Promise<{ valid: boolean; error?: string }> {
  if (!manifest.oauth) {
    return { valid: true };
  }

  if (!app.oauthClient) {
    return {
      valid: false,
      error: 'App has OAuth configuration but no credentials have been generated. Please contact support.'
    };
  }

  // Validate redirect URIs match
  const manifestUris = manifest.oauth.redirect_uris || [];
  const storedUris = app.oauthClient.redirectUris || [];
  
  if (JSON.stringify(manifestUris.sort()) !== JSON.stringify(storedUris.sort())) {
    return {
      valid: false,
      error: 'OAuth redirect_uris in manifest do not match approved configuration. Please ensure they match exactly.'
    };
  }

  return { valid: true };
}

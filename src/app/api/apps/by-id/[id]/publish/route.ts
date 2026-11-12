import { NextRequest, NextResponse } from 'next/server';
import { AppStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { appOwnerWhere } from '@/lib/apps/ownership';

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
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if app exists and get latest version, before the body is looked at: someone who may not
    // change this app learns nothing from how a request is validated.
    // The status belongs to the app's owner and to system admins; for anyone else the app does not exist.
    const isAdmin = actor.role === 'SYSTEM_ADMIN';
    const existingApp = await prisma.app.findFirst({
      where: { id, ...(isAdmin ? {} : appOwnerWhere(actor.id)) },
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

    // Parse and validate request body
    const body = await request.json();
    const { status } = PublishRequestSchema.parse(body);

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

    // Without an administrator an owner may withdraw, unpublish and resubmit, and publish the version that
    // was approved. Suspending, rejecting and lifting a suspension are an administrator's decisions.
    if (!isAdmin) {
      const ownerTransitions: Record<AppStatus, AppStatus[]> = {
        [AppStatus.DRAFT]: [AppStatus.IN_REVIEW, AppStatus.PUBLISHED],
        [AppStatus.IN_REVIEW]: [AppStatus.DRAFT],
        [AppStatus.PUBLISHED]: [AppStatus.DRAFT],
        [AppStatus.SUSPENDED]: [],
        [AppStatus.REJECTED]: [AppStatus.DRAFT, AppStatus.IN_REVIEW]
      };
      if (!ownerTransitions[currentStatus].includes(targetStatus)) {
        return NextResponse.json(
          { error: 'Only an administrator can make this change' },
          { status: 403 }
        );
      }
      if (targetStatus === AppStatus.PUBLISHED && existingApp.approvedVersionId !== latestVersion.id) {
        return NextResponse.json(
          { error: 'This version has not been approved. Submit it for review first.' },
          { status: 403 }
        );
      }
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

    // Use transaction to update app status
    const updatedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "App" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.app.findUnique({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
      });
      if (!current || current.status !== currentStatus || current.updatedAt.getTime() !== existingApp.updatedAt.getTime() ||
          current.versions[0]?.id !== latestVersion.id || current.approvedVersionId !== existingApp.approvedVersionId) return false;

      // Update app status
      const updated = await tx.app.updateMany({
        where: { id, status: currentStatus, updatedAt: existingApp.updatedAt, ...(isAdmin ? {} : appOwnerWhere(actor.id)) },
        data: { 
          status,
          // Publishing by an administrator is an approval of this version too
          ...(targetStatus === AppStatus.PUBLISHED ? { approvedVersionId: latestVersion.id } : {}),
          updatedAt
        }
      });

      return updated.count === 1;
    });

    if (!result) {
      return NextResponse.json({ error: 'App changed or access revoked' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      app: {
        id: existingApp.id,
        name: existingApp.name,
        slug: existingApp.slug,
        status,
        updatedAt
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

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const UpdateManifestSchema = z.object({
  entrypoint_url: z.string().url().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  icon_url: z.string().url().optional().nullable(),
  version: z.string().optional(),
  // OAuth configuration updates
  oauth: z.object({
    redirect_uris: z.array(z.string().url()).optional(),
  }).optional(),
  // CSP configuration updates
  csp: z.object({
    connectSrc: z.array(z.string()).optional(),
    imgSrc: z.array(z.string()).optional(),
    frameAncestors: z.array(z.string()).optional(),
  }).optional(),
});

/**
 * GET /api/apps/by-id/[id]/versions/[versionId] - Get app version details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SYSTEM_ADMIN can view app version details
    if (session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Only system administrators can view app version details' },
        { status: 403 }
      );
    }

    const version = await prisma.appVersion.findFirst({
      where: {
        id: versionId,
        appId: id,
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            isSystemApp: true,
          },
        },
      },
    });

    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    await prisma.$disconnect();

    return NextResponse.json({
      version: {
        id: version.id,
        version: version.version,
        manifest: version.manifest,
        createdAt: version.createdAt,
      },
      app: version.app,
    });
  } catch (error) {
    console.error('Error getting app version:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/apps/by-id/[id]/versions/[versionId] - Update app version manifest
 * Only SYSTEM_ADMIN can update app manifests
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SYSTEM_ADMIN can update app manifests
    if (session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Only system administrators can update app manifests' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = UpdateManifestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const updates = validation.data;

    // Get the current version
    const currentVersion = await prisma.appVersion.findFirst({
      where: {
        id: versionId,
        appId: id,
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!currentVersion) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Parse current manifest
    const currentManifest = currentVersion.manifest as Record<string, unknown>;

    // Build updated manifest
    const updatedManifest = {
      ...currentManifest,
      ...(updates.entrypoint_url && { entrypoint_url: updates.entrypoint_url }),
      ...(updates.name && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.icon_url !== undefined && { icon_url: updates.icon_url }),
      ...(updates.version && { version: updates.version }),
    };

    // Handle OAuth updates
    if (updates.oauth) {
      const currentOAuth = (currentManifest.oauth as Record<string, unknown>) || {};
      updatedManifest.oauth = {
        ...currentOAuth,
        ...(updates.oauth.redirect_uris && { redirect_uris: updates.oauth.redirect_uris }),
      };
    }

    // Handle CSP updates
    if (updates.csp) {
      const currentCsp = (currentManifest.csp as Record<string, unknown>) || {};
      updatedManifest.csp = {
        ...currentCsp,
        ...(updates.csp.connectSrc && { connectSrc: updates.csp.connectSrc }),
        ...(updates.csp.imgSrc && { imgSrc: updates.csp.imgSrc }),
        ...(updates.csp.frameAncestors && { frameAncestors: updates.csp.frameAncestors }),
      };
    }

    // Update the version manifest
    const updated = await prisma.appVersion.update({
      where: { id: versionId },
      data: {
        manifest: updatedManifest,
      },
    });

    // Also update app-level fields if name or icon changed
    if (updates.name || updates.icon_url !== undefined) {
      await prisma.app.update({
        where: { id },
        data: {
          ...(updates.name && { name: updates.name }),
          ...(updates.icon_url !== undefined && { iconUrl: updates.icon_url }),
        },
      });
    }

    // Update OAuth client redirect URIs if changed
    if (updates.oauth?.redirect_uris) {
      await prisma.appOAuthClient.updateMany({
        where: { appId: id },
        data: {
          redirectUris: updates.oauth.redirect_uris,
        },
      });
    }

    console.log(`🔧 App Manifest Updated: ${currentVersion.app.name}`, {
      appId: id,
      versionId,
      adminUserId: session.user.id,
      changes: Object.keys(updates),
    });

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: `App manifest updated successfully`,
      version: {
        id: updated.id,
        version: updated.version,
        manifest: updated.manifest,
      },
    });
  } catch (error) {
    console.error('Error updating app version:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

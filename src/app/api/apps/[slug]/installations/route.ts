import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { logAppInstallAttempt, logAppInstallFailed } from '@/lib/audit';
import { validateAppManifestSecurity } from '@/lib/security';
import { checkUserPermission, Permission } from '@/lib/permissions';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { workspaceId, workspaceSlug, scopes } = body;

    if (!workspaceId || !workspaceSlug) {
      return NextResponse.json(
        { error: 'Missing required parameters: workspaceId, workspaceSlug' },
        { status: 400 }
      );
    }

    // Verify session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is workspace admin
    const { hasPermission } = await checkUserPermission(
      session.user.id,
      workspaceId,
      Permission.MANAGE_APPS
    );

    if (!hasPermission) {
      await logAppInstallFailed(workspaceId, session.user.id, slug, 'Insufficient permissions to install apps');
      throw new Error('Insufficient permissions. Only workspace owners and admins can install apps.');
    }

    // Get app with OAuth client details
    const app = await prisma.app.findUnique({
      where: { 
        slug,
        status: 'PUBLISHED'
      },
      include: {
        oauthClient: true,
        scopes: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!app || !app.oauthClient) {
      return NextResponse.json(
        { error: 'App not found or OAuth not configured' },
        { status: 404 }
      );
    }

    // Validate app manifest security
    const appLatestVersion = app.versions[0];
    if (appLatestVersion) {
      const manifest = appLatestVersion.manifest as any;
      const securityValidation = validateAppManifestSecurity(manifest);
      if (!securityValidation.valid) {
        await logAppInstallFailed(workspaceId, session.user.id, app.id, `Security validation failed: ${securityValidation.errors.join(', ')}`);
        return NextResponse.json(
          { error: `App security validation failed: ${securityValidation.errors.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Check if already installed (exclude REMOVED installations)
    const existingInstallation = await prisma.appInstallation.findFirst({
      where: {
        appId: app.id,
        workspaceId,
        status: { not: 'REMOVED' } // Allow reinstallation after removal
      }
    });

    let installation;

    if (existingInstallation) {
      // If installation is ACTIVE, return error
      if (existingInstallation.status === 'ACTIVE') {
        return NextResponse.json(
          { error: 'App is already installed in this workspace' },
          { status: 409 }
        );
      }

      // If installation exists but is not ACTIVE (PENDING, SUSPENDED, etc.), update it
      installation = await prisma.appInstallation.update({
        where: { id: existingInstallation.id },
        data: {
          status: 'PENDING',
          scopes: scopes || app.scopes.map(s => s.scope),
          installedById: session.user.id,
          settings: {}
        }
      });
    } else {
      // Create new installation record - always start as PENDING
      installation = await prisma.appInstallation.create({
        data: {
          appId: app.id,
          workspaceId,
          installedById: session.user.id,
          status: 'PENDING',
          scopes: scopes || app.scopes.map(s => s.scope),
          settings: {}
        }
      });
    }

    // Log installation attempt
    await logAppInstallAttempt(workspaceId, session.user.id, app.id, { 
      installationId: installation.id,
      flow: 'oauth',
      scopes: installation.scopes 
    });


    // Return installation data for OAuth flow
    return NextResponse.json({
      success: true,
      installation: {
        id: installation.id,
        status: installation.status,
        scopes: installation.scopes
      },
      clientId: app.oauthClient.clientId,
      redirectUri: app.oauthClient.redirectUris[0], // Use first redirect URI
      scopes: installation.scopes
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating installation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
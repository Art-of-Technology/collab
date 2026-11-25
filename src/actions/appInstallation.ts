'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { logAppInstallAttempt, logAppInstallSuccess, logAppInstallFailed } from '@/lib/audit';
import { validateAppManifestSecurity } from '@/lib/security';
import { getWorkspaceAuthority, may } from '@/lib/workspace-authority';

import { prisma } from '@/lib/prisma';

const InstallAppSchema = z.object({
  appSlug: z.string(),
  workspaceId: z.string(),
  scopes: z.array(z.string()).optional()
});

const UninstallAppSchema = z.object({
  installationId: z.string(),
  workspaceId: z.string()
});

export async function installApp(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    const data = {
      appSlug: formData.get('appSlug') as string,
      workspaceId: formData.get('workspaceId') as string,
      scopes: formData.get('scopes') ? JSON.parse(formData.get('scopes') as string) : []
    };

    const { appSlug, workspaceId, scopes } = InstallAppSchema.parse(data);

    // Log installation attempt
    await logAppInstallAttempt(workspaceId, session.user.id, appSlug, { scopes });

    // Owners install apps. A platform admin, member or not, keeps the answer this action gave before.
    const authority = await getWorkspaceAuthority(session.user.id, workspaceId);
    if (!authority?.platformAdmin && !may(authority, 'apps.manage')) {
      await logAppInstallFailed(workspaceId, session.user.id, appSlug, 'Insufficient permissions to install apps');
      throw new Error('Insufficient permissions. Only Owners can install apps.');
    }

    // Get the app
    const app = await prisma.app.findUnique({
      where: { 
        slug: appSlug,
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

    if (!app) {
      await logAppInstallFailed(workspaceId, session.user.id, appSlug, 'App not found or not available for installation');
      throw new Error('App not found or not available for installation');
    }

    // Validate app manifest security
    const appLatestVersion = app.versions[0];
    if (appLatestVersion) {
      const manifest = appLatestVersion.manifest as any;
      const securityValidation = validateAppManifestSecurity(manifest);
      if (!securityValidation.valid) {
        await logAppInstallFailed(workspaceId, session.user.id, app.id, `Security validation failed: ${securityValidation.errors.join(', ')}`);
        throw new Error(`App security validation failed: ${securityValidation.errors.join(', ')}`);
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
        throw new Error('App is already installed in this workspace');
      }

      // If installation exists but is not ACTIVE, update it
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

    // Return installation data for OAuth flow
    return {
      success: true,
      installationId: installation.id,
      scopes: installation.scopes
    };

  } catch (error) {
    console.error('Error installing app:', error);
    throw error;
  }
}

export async function uninstallApp(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    const data = {
      installationId: formData.get('installationId') as string,
      workspaceId: formData.get('workspaceId') as string
    };

    const { installationId, workspaceId } = UninstallAppSchema.parse(data);

    // Owners uninstall apps. A platform admin, member or not, keeps the answer this action gave before.
    const authority = await getWorkspaceAuthority(session.user.id, workspaceId);
    if (!authority?.platformAdmin && !may(authority, 'apps.manage')) {
      throw new Error('Insufficient permissions. Only Owners can uninstall apps.');
    }

    // Get installation with app details
    const installation = await prisma.appInstallation.findUnique({
      where: { id: installationId },
      include: { app: true }
    });

    if (!installation || installation.workspaceId !== workspaceId) {
      throw new Error('Installation not found');
    }

    // Delete installation (tokens are stored in the installation record)
    await prisma.appInstallation.delete({
      where: { id: installationId }
    });

    // TODO: Log the uninstall action when audit logging is implemented
    console.log(`App ${installation.app.name} uninstalled from workspace ${workspaceId} by user ${session.user.id}`);

    return {
      success: true,
      message: `${installation.app.name} has been uninstalled successfully.`
    };

  } catch (error) {
    console.error('Error uninstalling app:', error);
    throw error;
  }
}

export async function getWorkspaceInstallations(workspaceId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    // Check if user has access to workspace
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id
      }
    });

    if (!member) {
      throw new Error('Access denied to workspace');
    }

    // Get explicitly installed apps
    const installations = await prisma.appInstallation.findMany({
      where: { workspaceId },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            slug: true,
            iconUrl: true,
            publisherId: true,
            permissions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get system apps (available to all workspaces without installation)
    // Use raw query to access isSystemApp field
    const systemApps = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      slug: string;
      iconUrl: string | null;
      publisherId: string;
      permissions: any;
    }>>`
      SELECT id, name, slug, "iconUrl", "publisherId", permissions
      FROM "App"
      WHERE "isSystemApp" = true AND status = 'PUBLISHED'
    `;

    // Get scopes for system apps
    const systemAppIds = systemApps.map(a => a.id);
    const systemAppScopes = systemAppIds.length > 0
      ? await prisma.appScope.findMany({
          where: { appId: { in: systemAppIds } },
          select: { appId: true, scope: true }
        })
      : [];

    // Convert system apps to installation-like format for consistency
    const installedAppIds = installations.map(inst => inst.app.id);
    const systemAppInstallations = systemApps
      .filter(sysApp => !installedAppIds.includes(sysApp.id)) // Exclude if already installed
      .map(sysApp => ({
        id: `system-${sysApp.id}`,
        status: 'ACTIVE' as const,
        createdAt: new Date(),
        scopes: systemAppScopes.filter(s => s.appId === sysApp.id).map(s => s.scope),
        app: {
          id: sysApp.id,
          name: sysApp.name,
          slug: sysApp.slug,
          iconUrl: sysApp.iconUrl,
          publisherId: sysApp.publisherId,
          permissions: sysApp.permissions
        }
      }));

    // Combine regular installations with system app "installations"
    const all = [...installations, ...systemAppInstallations];

    // The app page 404s unless the app is published, and has nothing to embed without an entrypoint.
    const versions = await prisma.appVersion.findMany({
      where: { appId: { in: all.map(inst => inst.app.id) }, app: { status: 'PUBLISHED' } },
      orderBy: { createdAt: 'desc' },
      distinct: ['appId'],
      select: { appId: true, manifest: true }
    });
    const withPage = new Set(versions
      .filter(v => (v.manifest as { entrypoint_url?: string } | null)?.entrypoint_url)
      .map(v => v.appId));
    return all.map(inst => ({ ...inst, app: { ...inst.app, hasPage: withPage.has(inst.app.id) } }));

  } catch (error) {
    console.error('Error fetching installations:', error);
    throw error;
  }
}

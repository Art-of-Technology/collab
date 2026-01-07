import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Image from 'next/image';
import { PrismaClient } from '@prisma/client';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppHost } from '@/components/apps/AppHost';
import { AppManifestV1, AppScope } from '@/lib/apps/types';

const prisma = new PrismaClient();

async function getAppData(slug: string, workspaceSlug: string, userId: string) {
  try {
    // Resolve workspace slug to workspace ID
    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      select: { id: true, slug: true, name: true }
    });
    
    if (!workspace) {
      return null;
    }

    // Check if user is a member of this workspace
    const memberRecord = await prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId: workspace.id
      }
    });

    if (!memberRecord) {
      return null;
    }

    // Get the app
    const app = await prisma.app.findUnique({
      where: {
        slug,
        status: 'PUBLISHED'
      },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        scopes: true,
        oauthClient: true,
        installations: {
          where: {
            workspaceId: workspace.id,
            status: { not: 'REMOVED' } // Exclude removed installations
          },
          select: {
            id: true,
            status: true,
            scopes: true
          }
        }
      }
    });

    if (!app) {
      return null;
    }

    // Check if app is installed in this workspace
    const installation = app.installations[0] || null;

    // Check if this is a system app (use raw query since Prisma client may not have this field)
    const systemAppCheck = await prisma.$queryRaw<Array<{ isSystemApp: boolean }>>`
      SELECT "isSystemApp" FROM "App" WHERE id = ${app.id}
    `;
    const isSystemApp = systemAppCheck[0]?.isSystemApp === true;

    return {
      app,
      installation,
      workspace,
      userRole: memberRecord.role,
      isInstalled: isSystemApp || installation?.status === 'ACTIVE',
      isSystemApp
    };
  } catch (error) {
    console.error('Error fetching app data:', error);
    return null;
  }
}

interface AppPageProps {
  params: Promise<{ workspaceId: string; slug: string }>;
}

export default async function AppWorkspacePage({ params }: AppPageProps) {
  const { workspaceId: workspaceSlug, slug } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    notFound();
  }

  const data = await getAppData(slug, workspaceSlug, session.user.id);

  if (!data) {
    notFound();
  }

  const { app, installation, workspace, userRole, isInstalled, isSystemApp } = data;
  const latestVersion = app.versions[0];
  const manifest = latestVersion?.manifest as unknown as AppManifestV1;

  // If app is installed (or is a system app), show the runtime
  if (isInstalled) {
    if (!manifest?.entrypoint_url) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              App Configuration Error
            </h2>
            <p className="text-gray-600">
              This app is missing a homepage URL and cannot be displayed.
            </p>
          </div>
        </div>
      );
    }

    // For system apps without installation, create a virtual installation object
    const effectiveInstallation = installation || (isSystemApp ? {
      id: `system-${app.id}`,
      scopes: app.scopes.map((s: { scope: string }) => s.scope),
      status: 'ACTIVE' as const
    } : null);

    if (!effectiveInstallation) {
      // This shouldn't happen, but handle it gracefully
      return null;
    }

    return (
      <div className="h-full">
        <AppHost
          app={{
            id: app.id,
            name: app.name,
            slug: app.slug,
            iconUrl: app.iconUrl || undefined,
            entrypointUrl: manifest.entrypoint_url
          }}
          installation={{
            id: effectiveInstallation.id,
            scopes: effectiveInstallation.scopes,
            status: effectiveInstallation.status
          }}
          workspace={{
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug
          }}
          user={{
            id: session.user.id,
            name: session.user.name || '',
            email: session.user.email || '',
            role: userRole
          }}
        />
      </div>
    );
  }

  // If app is not installed, show the installation UI
  // Import the existing InstallButton component
  const { InstallButton } = await import('./InstallButton');
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* App Installation Header */}
      <div className="flex items-start gap-6 mb-8">
        {app.iconUrl ? (
          <Image 
            src={app.iconUrl} 
            alt={`${app.name} icon`}
            width={80}
            height={80}
            className="w-20 h-20 rounded-xl object-cover border"
          />
        ) : (
          <div className="w-20 h-20 bg-muted rounded-xl flex items-center justify-center border">
            <div className="w-10 h-10 text-muted-foreground">📱</div>
          </div>
        )}
        
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{app.name}</h1>
            <span className="text-sm text-muted-foreground">in {workspace.name}</span>
          </div>
          
          <p className="text-muted-foreground mb-4">
            Published by <span className="font-medium">{app.publisherId}</span>
            {latestVersion && (
              <span> • Version {latestVersion.version}</span>
            )}
          </p>

          <InstallButton 
            app={{
              id: app.id,
              name: app.name,
              slug: app.slug,
              iconUrl: app.iconUrl || undefined,
              publisherId: app.publisherId
            }}
            scopes={app.scopes.map(s => s.scope as AppScope)}
            permissions={app.permissions as { org: boolean; user: boolean; }}
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            isInstalled={false}
          />
        </div>
      </div>

      {/* Installation Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">
          Ready to install {app.name}
        </h3>
        <p className="text-blue-800 text-sm mb-4">
          This app will be installed in the <strong>{workspace.name}</strong> workspace. 
          All members will be able to use it once installed.
        </p>
        <div className="text-xs text-blue-700">
          <strong>API Scopes:</strong> {app.scopes.map(s => s.scope).join(', ')}
        </div>
      </div>
    </div>
  );
}

import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Puzzle, Info, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { SystemAppToggle } from './SystemAppToggle';
import { AppConfigEditor } from './AppConfigEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

async function getPublishedApps() {
  const apps = await prisma.app.findMany({
    where: {
      status: 'PUBLISHED'
    },
    select: {
      id: true,
      name: true,
      slug: true,
      iconUrl: true,
      publisherId: true,
      isSystemApp: true,
      createdAt: true,
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          version: true,
          manifest: true,
        }
      },
      _count: {
        select: {
          installations: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    },
    orderBy: [
      { isSystemApp: 'desc' },
      { name: 'asc' }
    ]
  });

  return apps;
}

async function SystemAppsContent() {
  const apps = await getPublishedApps();
  const systemApps = apps.filter(app => app.isSystemApp);
  const regularApps = apps.filter(app => !app.isSystemApp);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">System Apps</h2>
        <p className="text-gray-400">
          Manage apps that are automatically available to all workspaces without installation.
        </p>
      </div>

      <Alert className="bg-[#22c55e]/5 border-[#22c55e]/20">
        <Info className="h-4 w-4 text-[#22c55e]" />
        <AlertTitle className="text-white">About System Apps</AlertTitle>
        <AlertDescription className="text-gray-400">
          System apps are automatically available to all workspaces. They don&apos;t appear in the app store
          and cannot be uninstalled by workspace admins. Use this for core integrations that should be
          available everywhere.
        </AlertDescription>
      </Alert>

      {/* Current System Apps */}
      <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Puzzle className="h-5 w-5 text-[#22c55e]" />
            Current System Apps ({systemApps.length})
          </CardTitle>
          <CardDescription className="text-gray-500">
            These apps are available to all workspaces automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          {systemApps.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No system apps configured yet</p>
              <p className="text-sm">Enable a published app below to make it a system app</p>
            </div>
          ) : (
            <div className="space-y-2">
              {systemApps.map((app) => (
                <AppRow key={app.id} app={app} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Apps */}
      <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
        <CardHeader>
          <CardTitle className="text-white">Available Published Apps ({regularApps.length})</CardTitle>
          <CardDescription className="text-gray-500">
            Enable any published app to make it a system app
          </CardDescription>
        </CardHeader>
        <CardContent>
          {regularApps.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No other published apps available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {regularApps.map((app) => (
                <AppRow key={app.id} app={app} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppRow({ app }: { app: any }) {
  const latestVersion = app.versions?.[0];
  const manifest = latestVersion?.manifest as any;
  const entrypointUrl = manifest?.entrypoint_url;

  return (
    <div className="p-4 rounded-lg border border-[#1f1f1f] hover:bg-[#1f1f1f]/50 transition-colors space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {app.iconUrl ? (
            <Image
              src={app.iconUrl}
              alt={`${app.name} icon`}
              width={40}
              height={40}
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 bg-[#1f1f1f] rounded-lg flex items-center justify-center flex-shrink-0">
              <Puzzle className="w-5 h-5 text-gray-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white truncate">{app.name}</span>
              {app.isSystemApp && (
                <Badge className="bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20 text-xs">
                  System
                </Badge>
              )}
              {latestVersion && (
                <Badge variant="outline" className="text-xs text-gray-400 border-gray-600">
                  v{latestVersion.version}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate">/{app.slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right text-sm text-gray-500 hidden sm:block">
            <div>{app._count.installations} installations</div>
          </div>
          <SystemAppToggle
            appId={app.id}
            appName={app.name}
            isSystemApp={app.isSystemApp}
          />
        </div>
      </div>

      {/* Show entrypoint and config options for system apps */}
      {app.isSystemApp && (
        <div className="pt-2 border-t border-[#1f1f1f]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-500 mb-1">Entrypoint URL</div>
              {entrypointUrl ? (
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-300 bg-[#1f1f1f] px-2 py-1 rounded truncate flex-1">
                    {entrypointUrl}
                  </code>
                  <Link href={entrypointUrl} target="_blank">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <span className="text-xs text-gray-500 italic">No entrypoint configured</span>
              )}
            </div>
            <AppConfigEditor
              appId={app.id}
              appName={app.name}
              appSlug={app.slug}
              isSystemApp={app.isSystemApp}
              version={latestVersion}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SystemAppsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2 bg-[#1f1f1f]" />
        <Skeleton className="h-4 w-96 bg-[#1f1f1f]" />
      </div>
      <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
        <CardHeader>
          <Skeleton className="h-6 w-48 bg-[#1f1f1f]" />
          <Skeleton className="h-4 w-64 bg-[#1f1f1f]" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border border-[#1f1f1f] rounded-lg">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg bg-[#1f1f1f]" />
                <div>
                  <Skeleton className="h-5 w-32 mb-1 bg-[#1f1f1f]" />
                  <Skeleton className="h-4 w-24 bg-[#1f1f1f]" />
                </div>
              </div>
              <Skeleton className="h-6 w-12 bg-[#1f1f1f]" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SystemAppsPage() {
  return (
    <Suspense fallback={<SystemAppsSkeleton />}>
      <SystemAppsContent />
    </Suspense>
  );
}

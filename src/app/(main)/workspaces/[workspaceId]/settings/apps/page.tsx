import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Puzzle, Store, BarChart3, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import WorkspaceAppsManager from '@/components/apps/WorkspaceAppsManager';
import AppStoreDiscovery from '@/components/apps/AppStoreDiscovery';
import AppAnalyticsDashboard from '@/components/apps/AppAnalyticsDashboard';

interface AppsPageProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

async function AppsPageContent({ workspaceId: id }: { workspaceId: string }) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Get workspace info
  const workspace = await prisma.workspace.findUnique({
    where: { slug: id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
    }
  });

  if (!workspace) {
    notFound();
  }

  const workspaceId = workspace.id;
  
  // Check if user has permission to manage workspace apps
  const hasPermission = await checkUserPermission(
    session.user.id,
    workspace.id,
    Permission.MANAGE_WORKSPACE_PERMISSIONS // Using existing permission, could create MANAGE_APPS later
  );

  console.log("hasPermission", hasPermission);
  if (!hasPermission.hasPermission) {
    notFound();
  }

  // Get installed apps for this workspace
  const installedApps = await prisma.appInstallation.findMany({
    where: {
      workspaceId,
      status: 'ACTIVE'
    },
    include: {
      app: {
        select: {
          id: true,
          name: true,
          slug: true,
          iconUrl: true,
          publisherId: true,
          status: true
        }
      },
      webhooks: {
        select: {
          id: true,
          url: true,
          eventTypes: true,
          isActive: true,
          _count: {
            select: {
              deliveries: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Get available apps for installation
  const availableApps = await prisma.app.findMany({
    where: {
      status: 'PUBLISHED',
      NOT: {
        installations: {
          some: {
            workspaceId,
            status: 'ACTIVE'
          }
        }
      }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      iconUrl: true,
      publisherId: true,
      scopes: {
        select: {
          scope: true
        }
      },
      permissions: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href={`/workspaces/${workspaceId}`}>
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to workspace
          </Button>
        </Link>
      </div>
      
      <div className="border-b border-border/40 pb-3 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Apps & Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Manage apps and integrations for <strong>{workspace.name}</strong>
        </p>
      </div>

      <Tabs defaultValue="installed" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="installed" className="flex items-center gap-1.5 text-sm">
            <Puzzle className="h-3 w-3" />
            Installed Apps
          </TabsTrigger>
          <TabsTrigger value="discover" className="flex items-center gap-1.5 text-sm">
            <Store className="h-3 w-3" />
            App Store
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5 text-sm">
            <BarChart3 className="h-3 w-3" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5 text-sm">
            <Settings className="h-3 w-3" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Installed Apps</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Manage apps that are currently installed in this workspace. You can configure settings, view webhooks, and uninstall apps.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <WorkspaceAppsManager 
                workspaceId={workspaceId}
                workspaceSlug={workspace.slug}
                installedApps={installedApps}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discover" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">App Store</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Discover and install new apps to extend your workspace functionality.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <AppStoreDiscovery 
                workspaceId={workspaceId}
                workspaceSlug={workspace.slug}
                availableApps={availableApps.map(app => ({
          ...app,
          permissions: app.permissions as { org: boolean; user: boolean; }
        }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">App Analytics</CardTitle>
              </div>
              <CardDescription className="text-xs">
                View usage statistics, webhook delivery metrics, and app performance data.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <AppAnalyticsDashboard 
                workspaceId={workspaceId}
                installedApps={installedApps}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">App Platform Settings</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Configure workspace-level app platform settings and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-4">
                <div className="p-4 border border-border/20 rounded-lg bg-muted/20">
                  <h3 className="text-sm font-medium mb-2">Security Settings</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Configure security policies for app installations and permissions.
                  </p>
                  <Button variant="outline" size="sm">
                    Configure Security
                  </Button>
                </div>
                
                <div className="p-4 border border-border/20 rounded-lg bg-muted/20">
                  <h3 className="text-sm font-medium mb-2">Webhook Settings</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Manage global webhook settings and delivery preferences.
                  </p>
                  <Button variant="outline" size="sm">
                    Webhook Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppsPageSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Skeleton className="h-8 w-32" />
      </div>
      
      <div className="border-b border-border/40 pb-3 mb-4">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function AppsPage({ params }: AppsPageProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={<AppsPageSkeleton />}>
      <AppsPageContent workspaceId={workspaceId} />
    </Suspense>
  );
}

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Settings, ExternalLink, Package, FileText, CheckCircle, Download } from 'lucide-react';
import Image from 'next/image';
import { AppStatusBadge } from '@/components/apps/AppStatusBadge';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

async function getApps(userId: string, status?: string) {
  const whereClause: any = {
    OR: [
      { userId },
      { publisherId: userId }
    ]
  };

  // Add status filter if provided
  if (status) {
    const statusMap: Record<string, string> = {
      'draft': 'DRAFT',
      'in_review': 'IN_REVIEW',
      'published': 'PUBLISHED',
      'rejected': 'REJECTED',
      'suspended': 'SUSPENDED'
    };
    
    if (statusMap[status.toLowerCase()]) {
      whereClause.status = statusMap[status.toLowerCase()];
    }
  }

  const apps = await prisma.app.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      installations: {
        select: {
          id: true,
          status: true,
          workspaceId: true
        }
      },
      _count: {
        select: {
          installations: true
        }
      }
    }
  });

  return apps;
}


export default async function DevAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const params = await searchParams;
  const apps = await getApps(session.user.id, params.status);

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">My Apps</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">
            Manage your apps for the Collab platform
          </p>
        </div>
        <Link href="/dev/apps/new">
          <Button size="sm" className="sm:h-9 sm:px-4 sm:text-sm">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Create App</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </Link>
      </div>

      {apps.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="mx-auto w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-4">
              <Settings className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No apps yet</h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first app for the Collab platform.
            </p>
            <Link href="/dev/apps/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First App
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <Card key={app.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {app.iconUrl ? (
                      <Image 
                        width={40}
                        height={40}
                        src={app.iconUrl} 
                        alt={`${app.name} icon`}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                        <Settings className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <CardTitle
                        className="text-lg truncate max-w-[10rem]"
                        title={app.name}
                      >
                        {app.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">/{app.slug}</p>
                    </div>
                  </div>
                  <AppStatusBadge status={app.status} className="whitespace-nowrap" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Installations:</span>
                    <span className="font-medium">{app._count.installations}</span>
                  </div>
                  
                  {app.versions[0] && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Version:</span>
                      <span className="font-medium">{app.versions[0].version}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="font-medium">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Link href={`/dev/apps/${app.slug}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Settings className="w-4 h-4 mr-2" />
                        Manage
                      </Button>
                    </Link>
                    
                    {app.status === 'PUBLISHED' && (
                      <Link href={`/api/apps/${app.slug}`} target="_blank">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {apps.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4">Quick Stats</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <Card className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-3 pt-3">
                <CardTitle className="text-xs font-medium">Total Apps</CardTitle>
                <div className="p-1.5 bg-blue-500/10 rounded-lg">
                  <Package className="h-3 w-3 text-blue-400" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="text-lg sm:text-xl font-bold">{apps.length}</div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-3 pt-3">
                <CardTitle className="text-xs font-medium">Published</CardTitle>
                <div className="p-1.5 bg-green-500/10 rounded-lg">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="text-lg sm:text-xl font-bold">
                  {apps.filter(app => app.status === 'PUBLISHED').length}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-3 pt-3">
                <CardTitle className="text-xs font-medium">Draft</CardTitle>
                <div className="p-1.5 bg-gray-500/10 rounded-lg">
                  <FileText className="h-3 w-3 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="text-lg sm:text-xl font-bold">
                  {apps.filter(app => app.status === 'DRAFT').length}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-3 pt-3">
                <CardTitle className="text-xs font-medium">Total Installs</CardTitle>
                <div className="p-1.5 bg-purple-500/10 rounded-lg">
                  <Download className="h-3 w-3 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="text-lg sm:text-xl font-bold">
                  {apps.reduce((sum, app) => sum + app._count.installations, 0)}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

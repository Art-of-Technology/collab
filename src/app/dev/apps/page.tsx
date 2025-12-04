import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Settings, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { AppStatusBadge } from '@/components/apps/AppStatusBadge';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

const prisma = new PrismaClient();

async function getApps(userId: string) {
  const apps = await prisma.app.findMany({
    where: {
      userId
    },
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

  await prisma.$disconnect();
  return apps;
}


export default async function DevAppsPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }
  
  const apps = await getApps(session.user.id);

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Developer Console</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">
            Manage your apps for the Collab platform
          </p>
        </div>
        <Link href="/dev/apps/new">
          <Button size="sm" className="sm:size-default">
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
        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-semibold mb-2">Quick Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium">{apps.length}</div>
              <div className="text-muted-foreground">Total Apps</div>
            </div>
            <div>
              <div className="font-medium">
                {apps.filter(app => app.status === 'PUBLISHED').length}
              </div>
              <div className="text-muted-foreground">Published</div>
            </div>
            <div>
              <div className="font-medium">
                {apps.filter(app => app.status === 'DRAFT').length}
              </div>
              <div className="text-muted-foreground">Draft</div>
            </div>
            <div>
              <div className="font-medium">
                {apps.reduce((sum, app) => sum + app._count.installations, 0)}
              </div>
              <div className="text-muted-foreground">Total Installs</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

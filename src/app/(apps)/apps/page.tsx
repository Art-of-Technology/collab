import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Store } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import GlobalAppDiscovery from '@/components/apps/GlobalAppDiscovery';

async function getPublishedApps() {
  const apps = await prisma.app.findMany({
    where: {
      status: 'PUBLISHED',
      isSystemApp: false  // Hide system apps from app store
    },
    select: {
      id: true,
      name: true,
      slug: true,
      iconUrl: true,
      publisherId: true,
      status: true,
      createdAt: true,
      scopes: true,
      permissions: true,
      _count: {
        select: {
          installations: {
            where: {
              status: 'ACTIVE'
            }
          }
        }
      }
    },
    orderBy: [
      { createdAt: 'desc' }
    ]
  });

  return apps;
}

async function getAppStats() {
  const [totalApps, totalInstallations, recentApps] = await Promise.all([
    prisma.app.count({
      where: { status: 'PUBLISHED', isSystemApp: false }
    }),
    prisma.appInstallation.count({
      where: { status: 'ACTIVE' }
    }),
    prisma.app.count({
      where: {
        status: 'PUBLISHED',
        isSystemApp: false,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    })
  ]);

  return {
    totalApps,
    totalInstallations,
    recentApps
  };
}

async function AppsPageContent() {
  const session = await getServerSession(authOptions);
  const [apps, stats] = await Promise.all([
    getPublishedApps(),
    getAppStats()
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Collab App Store</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Discover apps and integrations to extend your workspace functionality. 
          Connect with your favorite tools and streamline your workflow.
        </p>
      </div>

      {/* Main App Discovery */}
      <GlobalAppDiscovery 
        apps={apps.map(app => ({
          ...app,
          permissions: app.permissions as { org: boolean; user: boolean; }
        }))} 
        userSession={session}
        showFeatured={false}
      />
    </div>
  );
}

function AppsPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header Skeleton */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-6 w-96 mx-auto" />
      </div>

      {/* Apps Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(9)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default async function AppsPage() {
  return (
    <Suspense fallback={<AppsPageSkeleton />}>
      <AppsPageContent />
    </Suspense>
  );
}

export const metadata = {
  title: 'App Store - Collab',
  description: 'Discover apps and integrations to extend your workspace functionality.',
};

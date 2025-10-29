import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, ExternalLink, Calendar, User, Building } from 'lucide-react';
import { AppManifestV1, AppScope } from '@/lib/apps/types';
import { AppStoreInstallButton } from '@/components/apps/AppStoreInstallButton';
import Image from 'next/image';

const prisma = new PrismaClient();

async function getApp(slug: string) {
  const app = await prisma.app.findUnique({
    where: { 
      slug,
      status: 'PUBLISHED' // Only show published apps
    },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      oauthClient: true,
      scopes: true,
      installations: {
        select: {
          id: true,
          workspaceId: true,
          status: true
        }
      }
    }
  });

  await prisma.$disconnect();
  return app;
}

function getScopeIcon(scope: AppScope) {
  if (scope.includes('workspace')) return <Building className="w-4 h-4" />;
  if (scope.includes('user')) return <User className="w-4 h-4" />;
  return <Shield className="w-4 h-4" />;
}

export default async function AppDiscoveryPage({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;
  const app = await getApp(slug);

  if (!app) {
    notFound();
  }

  const latestVersion = app.versions[0];
  const manifest = latestVersion?.manifest as unknown as AppManifestV1;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* App Header */}
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
            <Shield className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{app.name}</h1>
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
              {app.status}
            </Badge>
          </div>
          
          <p className="text-muted-foreground mb-4">
            Published by <span className="font-medium">{app.publisherId}</span>
            {latestVersion && (
              <span> • Version {latestVersion.version}</span>
            )}
          </p>

          <div className="flex items-center gap-3">
            <AppStoreInstallButton 
              app={{
                id: app.id,
                name: app.name,
                slug: app.slug,
                iconUrl: app.iconUrl || undefined,
                publisherId: app.publisherId
              }}
              scopes={app.scopes.map(s => s.scope as AppScope)}
              permissions={app.permissions as { org: boolean; user: boolean; }}
            />
            
            {manifest?.entrypoint_url && (
              <Button variant="outline" asChild>
                <a href={manifest.entrypoint_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Visit Homepage
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Permissions
            </CardTitle>
            <CardDescription>
              What this app can access in your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {app.scopes.map((scope) => (
                <div key={scope.id} className="flex items-center gap-3 p-2 border rounded-lg">
                  {getScopeIcon(scope.scope as AppScope)}
                  <div>
                    <div className="font-medium text-sm">{scope.scope}</div>
                    <div className="text-xs text-muted-foreground">
                      {scope.scope.includes('read') ? 'Read access' : 'Read and write access'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* App Details */}
        <Card>
          <CardHeader>
            <CardTitle>App Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Slug</div>
              <div className="font-mono text-sm">{app.slug}</div>
            </div>
            
            {manifest?.oauth && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Authentication</div>
                <div className="text-sm">OAuth 2.0 with PKCE</div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="text-sm flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(app.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Last Updated</div>
              <div className="text-sm flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(app.updatedAt).toLocaleDateString()}
              </div>
            </div>

            {app.manifestUrl && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Manifest</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                    {app.manifestUrl}
                  </code>
                  <Button variant="outline" size="sm" asChild>
                    <a href={app.manifestUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Version History */}
      {app.versions.length > 1 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Version History</CardTitle>
            <CardDescription>
              Recent versions of this app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {app.versions.slice(0, 5).map((version, index) => (
                <div key={version.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <Badge variant={index === 0 ? 'default' : 'outline'}>
                      v{version.version}
                    </Badge>
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs">LATEST</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(version.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

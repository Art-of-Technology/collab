import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Settings, Users, Code, Globe, Webhook, BarChart3 } from 'lucide-react';
import { AppManifestV1 } from '@/lib/apps/types';
import { PublishToggle } from './PublishToggle';
import WebhookManager from '@/components/apps/WebhookManager';
import DeveloperAnalytics from '@/components/apps/DeveloperAnalytics';
import Image from 'next/image';

const prisma = new PrismaClient();

async function getApp(id: string) {
  const app = await prisma.app.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' }
      },
      oauthClient: true,
      scopes: true,
      installations: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          },
          webhooks: {
            include: {
              _count: {
                select: {
                  deliveries: true
                }
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  await prisma.$disconnect();
  return app;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'PUBLISHED': return 'bg-green-100 text-green-800 border-green-200';
    case 'DRAFT': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'SUSPENDED': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export default async function AppDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  const app = await getApp(id);

  if (!app) {
    notFound();
  }

  const latestVersion = app.versions[0];
  const manifest = latestVersion?.manifest as unknown as AppManifestV1;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <Link href="/dev/apps" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Apps
        </Link>
        
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {app.iconUrl ? (
              <Image 
                src={app.iconUrl} 
                alt={`${app.name} icon`}
                width={64}
                height={64}
                className="w-16 h-16 rounded-xl object-cover"
              />
            ) : (
              <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center">
                <Settings className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{app.name}</h1>
              <p className="text-muted-foreground">/{app.slug}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className={getStatusColor(app.status)}>
                  {app.status}
                </Badge>
                {latestVersion && (
                  <Badge variant="outline">
                    v{latestVersion.version}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <PublishToggle appId={app.id} currentStatus={app.status} />
            {app.status === 'PUBLISHED' && (
              <Link href={`/api/apps/${app.slug}`} target="_blank">
                <Button variant="outline">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Public
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Settings className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="installations" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Installations
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-1.5">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
        {/* App Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              App Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Publisher</div>
              <div>{app.publisherId}</div>
            </div>
            
            <div>
              <div className="text-sm font-medium text-muted-foreground">Manifest URL</div>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                  {app.manifestUrl}
                </code>
                <Link href={app.manifestUrl} target="_blank">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div>{new Date(app.createdAt).toLocaleDateString()} at {new Date(app.createdAt).toLocaleTimeString()}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Last Updated</div>
              <div>{new Date(app.updatedAt).toLocaleDateString()} at {new Date(app.updatedAt).toLocaleTimeString()}</div>
            </div>
          </CardContent>
        </Card>

        {/* Manifest Info */}
        {manifest && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5" />
                Manifest Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {manifest.entrypoint_url && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Homepage URL</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                      {manifest.entrypoint_url}
                    </code>
                    <Link href={manifest.entrypoint_url} target="_blank">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-muted-foreground">Permissions</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {manifest.scopes.map((scope) => (
                    <Badge key={scope} variant="secondary" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>

              {manifest.oauth && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">OAuth Client</div>
                  <div className="text-sm">
                    <div>Client ID: <code className="bg-muted px-1 rounded">{manifest.oauth.client_id}</code></div>
                    <div className="mt-1">Redirect URIs: {manifest.oauth.redirect_uris.length}</div>
                  </div>
                </div>
              )}

              {manifest.webhooks && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Webhooks</div>
                  <div className="text-sm">
                    <div>URL: <code className="bg-muted px-1 rounded text-xs">{manifest.webhooks.url}</code></div>
                    <div className="mt-1">Events: {manifest.webhooks.events.join(', ')}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}


        {/* Versions */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="w-5 h-5" />
              Versions ({app.versions.length})
            </CardTitle>
            <CardDescription>
              Version history for this app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {app.versions.map((version, index) => (
                <div key={version.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={index === 0 ? 'default' : 'outline'}>
                      v{version.version}
                    </Badge>
                    <div className="text-sm text-muted-foreground">
                      {new Date(version.createdAt).toLocaleDateString()} at {new Date(version.createdAt).toLocaleTimeString()}
                    </div>
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs">
                        LATEST
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="installations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Installations ({app.installations.length})
              </CardTitle>
              <CardDescription>
                Workspaces that have installed this app
              </CardDescription>
            </CardHeader>
            <CardContent>
              {app.installations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No installations yet</p>
                  <p className="text-sm">Your app needs to be published before it can be installed.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {app.installations.map((installation) => (
                    <div key={installation.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium">{installation.workspace.name}</div>
                          <div className="text-sm text-muted-foreground">/{installation.workspace.slug}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-sm font-medium">{installation.webhooks.length}</div>
                          <div className="text-xs text-muted-foreground">Webhooks</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={installation.status === 'ACTIVE' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {installation.status}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {new Date(installation.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhookManager appId={app.id} appSlug={app.slug} installations={app.installations} />
        </TabsContent>

        <TabsContent value="analytics">
          <DeveloperAnalytics appId={app.id} appSlug={app.slug} installations={app.installations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
import { AppStatusBadge } from '@/components/apps/AppStatusBadge';
import { OAuthCredentialsCard } from './OAuthCredentialsCard';
import { ManifestSubmissionCard } from './ManifestSubmissionCard';
import { DeleteButton } from './DeleteButton';

const prisma = new PrismaClient();

async function getApp(slug: string) {
  const app = await prisma.app.findUnique({
    where: { slug },
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


export default async function AppDetailPage({ 
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
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="mb-6 sm:mb-8">
        <Link href="/dev/apps" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Apps
        </Link>
        
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            {app.iconUrl ? (
              <Image 
                src={app.iconUrl} 
                alt={`${app.name} icon`}
                width={64}
                height={64}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-xl flex items-center justify-center flex-shrink-0">
                <Settings className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight break-words">{app.name}</h1>
              <p className="text-sm sm:text-base text-muted-foreground break-all">/{app.slug}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <AppStatusBadge status={app.status} />
                {latestVersion && (
                  <Badge variant="outline" className="text-xs sm:text-sm">
                    v{latestVersion.version}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
            <PublishToggle appId={app.id} currentStatus={app.status} />
            {app.status === 'PUBLISHED' && (
              <Link href={`/api/apps/${app.slug}`} target="_blank">
                <Button variant="outline" size="sm" className="sm:size-default">
                  <ExternalLink className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">View Public</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full h-auto sm:h-9 grid-cols-2 grid-rows-2 gap-1 sm:gap-0 sm:grid-rows-1 sm:grid-cols-4 mb-4 sm:mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
            <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Overview</span>
            <span className="xs:hidden">Info</span>
          </TabsTrigger>
          <TabsTrigger value="installations" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Installations</span>
            <span className="xs:hidden">Installs</span>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
            <Webhook className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Webhooks</span>
            <span className="xs:hidden">Hooks</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Analytics</span>
            <span className="xs:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">

            {/* Manifest Submission - Show for DRAFT apps without a manifest */}
            {app.status === 'DRAFT' && !manifest && (
              <ManifestSubmissionCard appSlug={app.slug} />
            )}

            {/* Manifest Info */}
            {manifest && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="w-5 h-5" />
                    Manifest Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div>
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground">Entrypoint URL</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs sm:text-sm bg-muted px-2 py-1 rounded flex-1 truncate min-w-0">
                        {manifest.entrypoint_url}
                      </code>
                      <Link href={manifest.entrypoint_url} target="_blank">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {manifest.publisher && (
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-muted-foreground">Publisher</div>
                      <div className="text-sm">
                        <div className="break-words">{manifest.publisher.name}</div>
                        <div className="text-muted-foreground text-xs sm:text-sm break-all">{manifest.publisher.support_email}</div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-sm font-medium text-muted-foreground">App Type</div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {manifest.type.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Visibility</div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {manifest.visibility}
                    </Badge>
                  </div>

                  <div>
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground">Permissions</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {manifest.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs break-all">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {manifest.oauth && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">OAuth Configuration</div>
                      <div className="text-sm space-y-1">
                        {manifest.oauth.client_id && (
                          <div>Client ID: <code className="bg-muted px-1 rounded">{manifest.oauth.client_id}</code></div>
                        )}
                        <div>Client Type: <Badge variant="outline" className="text-xs">{manifest.oauth.client_type}</Badge></div>
                        <div>Redirect URIs: {manifest.oauth.redirect_uris.length}</div>
                        {manifest.oauth.token_endpoint_auth_method && (
                          <div>Auth Method: <code className="bg-muted px-1 rounded text-xs">{manifest.oauth.token_endpoint_auth_method}</code></div>
                        )}
                      </div>
                    </div>
                  )}

                  {manifest.webhooks && manifest.webhooks.endpoints && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Webhook Endpoints</div>
                      <div className="text-sm space-y-2">
                        {manifest.webhooks.endpoints.map((endpoint, index) => (
                          <div key={index} className="border rounded p-2">
                            <div>URL: <code className="bg-muted px-1 rounded text-xs">{endpoint.url}</code></div>
                            <div className="mt-1">Events: {endpoint.events.join(', ')}</div>
                            <div className="mt-1">Signature: {endpoint.signature.type} via {endpoint.signature.header}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* OAuth Credentials - Always show when available */}
            {app.oauthClient && (
              <OAuthCredentialsCard oauthClient={app.oauthClient} appId={app.id} appStatus={app.status} />
            )}
            
            {/* App Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  App Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Publisher</div>
                  <div className="text-sm sm:text-base break-words">{app.publisherId}</div>
                </div>
                
              {app.manifestUrl && <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Manifest URL</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs sm:text-sm bg-muted px-2 py-1 rounded flex-1 truncate min-w-0">
                      {app.manifestUrl}
                    </code>
                    <Link href={app.manifestUrl} target="_blank">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>}

                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Created</div>
                  <div className="text-sm sm:text-base">
                    <div className="sm:hidden">{new Date(app.createdAt).toLocaleDateString()}</div>
                    <div className="hidden sm:block">{new Date(app.createdAt).toLocaleDateString()} at {new Date(app.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground">Last Updated</div>
                  <div className="text-sm sm:text-base">
                    <div className="sm:hidden">{new Date(app.updatedAt).toLocaleDateString()}</div>
                    <div className="hidden sm:block">{new Date(app.updatedAt).toLocaleDateString()} at {new Date(app.updatedAt).toLocaleTimeString()}</div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="pt-4 border-t">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Once you delete an app, there is no going back. Please be certain.
                    </p>
                    <DeleteButton appSlug={app.slug} appName={app.name} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Versions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Code className="w-4 h-4 sm:w-5 sm:h-5" />
                  Versions ({app.versions.length})
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Version history for this app
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {app.versions.map((version, index) => (
                    <div key={version.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <Badge variant={index === 0 ? 'default' : 'outline'} className="text-xs">
                          v{version.version}
                        </Badge>
                        <div className="text-xs sm:text-sm text-muted-foreground">
                          <div className="sm:hidden">{new Date(version.createdAt).toLocaleDateString()}</div>
                          <div className="hidden sm:block">{new Date(version.createdAt).toLocaleDateString()} at {new Date(version.createdAt).toLocaleTimeString()}</div>
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
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                Installations ({app.installations.length})
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Workspaces that have installed this app
              </CardDescription>
            </CardHeader>
            <CardContent>
              {app.installations.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-muted-foreground">
                  <Users className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                  <p className="text-sm sm:text-base">No installations yet</p>
                  <p className="text-xs sm:text-sm">Your app needs to be published before it can be installed.</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {app.installations.map((installation) => (
                    <div key={installation.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg gap-3 sm:gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                          <Globe className="w-3 h-3 sm:w-4 sm:h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm sm:text-base truncate">{installation.workspace.name}</div>
                          <div className="text-xs sm:text-sm text-muted-foreground break-all">/{installation.workspace.slug}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        <div className="text-center">
                          <div className="text-xs sm:text-sm font-medium">{installation.webhooks.length}</div>
                          <div className="text-xs text-muted-foreground">Webhooks</div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant={installation.status === 'ACTIVE' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {installation.status}
                          </Badge>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
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

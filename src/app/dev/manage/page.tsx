import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Eye, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { AppManifestV1 } from '@/lib/apps/types';
import { AppStatusBadge } from '@/components/apps/AppStatusBadge';
import Image from 'next/image';
import Link from 'next/link';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppReviewActions } from './AppReviewActions';

const prisma = new PrismaClient();

async function getAppsForReview() {
  const apps = await prisma.app.findMany({
    where: {
      status: {
        in: ['IN_REVIEW']
      }
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
          status: true
        }
      },
      _count: {
        select: {
          installations: true
        }
      }
    },
    orderBy: [
      { status: 'asc' }, // IN_REVIEW first, then DRAFT
      { createdAt: 'desc' }
    ]
  });

  await prisma.$disconnect();
  return apps;
}

export default async function ManageAppsPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session?.user?.id) {
    redirect('/auth/signin');
  }
  const isAdmin = session.user.role === 'SYSTEM_ADMIN';
  
  if (!isAdmin) {
    notFound();
  }

  const apps = await getAppsForReview();
  const inReviewApps = apps.filter(app => app.status === 'IN_REVIEW');
  const draftApps = apps.filter(app => app.status === 'DRAFT');

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-6xl">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">App Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Review and manage app submissions
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="review" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
          <TabsTrigger value="review" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Pending Review ({inReviewApps.length})</span>
          </TabsTrigger>
          <TabsTrigger value="drafts" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Drafts ({draftApps.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review">
          {inReviewApps.length === 0 ? (
            <Card className="text-center py-8 sm:py-12">
              <CardContent>
                <Clock className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No apps pending review</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  All submitted apps have been reviewed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {inReviewApps.map((app) => (
                <AppReviewCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="drafts">
          {draftApps.length === 0 ? (
            <Card className="text-center py-8 sm:py-12">
              <CardContent>
                <Eye className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No draft apps</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  No apps are currently in draft status.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {draftApps.map((app) => (
                <AppReviewCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppReviewCard({ app }: { app: any }) {
  const latestVersion = app.versions[0];
  const manifest = latestVersion?.manifest as unknown as AppManifestV1;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            {app.iconUrl ? (
               <Image
                src={app.iconUrl} 
                alt={`${app.name} icon`}
                width={48}
                height={48}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-base sm:text-lg truncate">{app.name}</CardTitle>
                <AppStatusBadge status={app.status} />
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground break-all">/{app.slug}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Publisher: {app.publisherId}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Link href={`/dev/apps/${app.slug}`}>
              <Button variant="outline" size="sm">
                <Eye className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">View Details</span>
              </Button>
            </Link>
            {app.manifestUrl && (
              <Link href={app.manifestUrl} target="_blank">
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Manifest</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 sm:space-y-6">
        {manifest && (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">App Type</div>
              <Badge variant="outline" className="text-xs">
                {manifest.type?.replace('_', ' ') || 'Unknown'}
              </Badge>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Visibility</div>
              <Badge variant="outline" className="text-xs capitalize">
                {manifest.visibility || 'Unknown'}
              </Badge>
            </div>
            
            {/* OAuth Configuration */}
            {manifest.oauth && (
              <>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Client Type</div>
                  <Badge variant={manifest.oauth.client_type === 'public' ? 'secondary' : 'default'} className="text-xs">
                    {manifest.oauth.client_type || 'Unknown'}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Auth Method</div>
                  <Badge variant="outline" className="text-xs">
                    {manifest.oauth.token_endpoint_auth_method || 'client_secret_basic'}
                  </Badge>
                </div>
                {manifest.oauth.token_endpoint_auth_method === 'private_key_jwt' && (
                  <div className="sm:col-span-2">
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">JWKS Status</div>
                    <div className="flex items-center gap-2">
                      <Badge variant={app.oauthClient?.jwksValidated ? 'default' : 'destructive'} className="text-xs">
                        {app.oauthClient?.jwksValidated ? '✓ Validated' : '✗ Not Validated'}
                      </Badge>
                      {manifest.oauth.jwks_uri && (
                        <Link href={manifest.oauth.jwks_uri} target="_blank" className="text-xs text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* MFE Configuration */}
            {manifest.mfe && (
              <>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Remote Name</div>
                  <Badge variant="outline" className="text-xs">
                    {manifest.mfe.remoteName}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Module</div>
                  <Badge variant="outline" className="text-xs">
                    {manifest.mfe.module}
                  </Badge>
                </div>
                {manifest.mfe.integrity && (
                  <div className="sm:col-span-2">
                    <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Integrity Hash</div>
                    <div className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                      {manifest.mfe.integrity}
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div className="sm:col-span-2">
              <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Scopes</div>
              <div className="flex flex-wrap gap-1">
                {manifest.scopes?.map((scope) => (
                  <Badge key={scope} variant="secondary" className="text-xs">
                    {scope}
                  </Badge>
                )) || <span className="text-xs text-muted-foreground">No scopes</span>}
              </div>
            </div>
          </div>
        )}

        {app.status === 'IN_REVIEW' && (
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 sm:pt-4 border-t">
            <AppReviewActions appId={app.id} appName={app.name} />
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
            <span>Created: {new Date(app.createdAt).toLocaleDateString()}</span>
            <span>Updated: {new Date(app.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

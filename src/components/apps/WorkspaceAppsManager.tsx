'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Puzzle, 
  MoreVertical, 
  Settings, 
  Trash2, 
  ExternalLink, 
  Webhook, 
  Activity,
  AlertCircle 
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface InstalledApp {
  id: string;
  status: string;
  createdAt: Date;
  app: {
    id: string;
    name: string;
    slug: string;
    iconUrl: string | null;
    publisherId: string;
    status: string;
  };
  webhooks: Array<{
    id: string;
    url: string;
    eventTypes: string[];
    isActive: boolean;
    _count: {
      deliveries: number;
    };
  }>;
}

interface WorkspaceAppsManagerProps {
  workspaceId: string;
  workspaceSlug: string;
  installedApps: InstalledApp[];
}

export default function WorkspaceAppsManager({ 
  workspaceId, 
  workspaceSlug, 
  installedApps 
}: WorkspaceAppsManagerProps) {
  const [uninstallApp, setUninstallApp] = useState<InstalledApp | null>(null);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const router = useRouter();

  const handleUninstall = async (app: InstalledApp) => {
    setIsUninstalling(true);
    try {
      const response = await fetch(`/api/apps/${app.app.slug}/uninstall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        throw new Error('Failed to uninstall app');
      }

      toast.success(`${app.app.name} has been uninstalled`);
      router.refresh();
    } catch (error) {
      console.error('Error uninstalling app:', error);
      toast.error('Failed to uninstall app');
    } finally {
      setIsUninstalling(false);
      setUninstallApp(null);
    }
  };

  const navigateToApp = (appSlug: string) => {
    router.push(`/${workspaceSlug}/apps/${appSlug}`);
  };

  const navigateToAppSettings = (appSlug: string) => {
    router.push(`/${workspaceSlug}/apps/${appSlug}/settings`);
  };

  if (installedApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Puzzle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No apps installed</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Install apps from the App Store to extend your workspace functionality and integrate with external services.
        </p>
        <Button variant="outline" size="sm" onClick={() => {/* Switch to discover tab */}}>
          Browse App Store
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {installedApps.map((installation) => {
          const { app } = installation;
          const totalWebhooks = installation.webhooks.length;
          const activeWebhooks = installation.webhooks.filter(w => w.isActive).length;
          const totalDeliveries = installation.webhooks.reduce((sum, w) => sum + w._count.deliveries, 0);

          return (
            <Card key={installation.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {app.iconUrl ? (
                      <Image
                        src={app.iconUrl}
                        alt={`${app.name} icon`}
                        width={40}
                        height={40}
                        className="rounded-lg border"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                        <Puzzle className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-sm font-medium">{app.name}</CardTitle>
                      <CardDescription className="text-xs">
                        by {app.publisherId}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => navigateToApp(app.slug)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open App
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigateToAppSettings(app.slug)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setUninstallApp(installation)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Uninstall
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={installation.status === 'ACTIVE' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {installation.status}
                    </Badge>
                    {app.status === 'PUBLISHED' ? (
                      <Badge variant="outline" className="text-xs">
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {app.status}
                      </Badge>
                    )}
                  </div>

                  {/* Webhooks & Activity */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Webhook className="w-3 h-3" />
                      <span>{activeWebhooks}/{totalWebhooks} webhooks</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      <span>{totalDeliveries} deliveries</span>
                    </div>
                  </div>

                  {/* Webhook Status Indicators */}
                  {totalWebhooks > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {installation.webhooks.map((webhook) => (
                        <div
                          key={webhook.id}
                          className={`w-2 h-2 rounded-full ${
                            webhook.isActive ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={`${webhook.url} - ${webhook.isActive ? 'Active' : 'Inactive'}`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => navigateToApp(app.slug)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => navigateToAppSettings(app.slug)}
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      Settings
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Uninstall Confirmation Dialog */}
      <AlertDialog open={!!uninstallApp} onOpenChange={() => setUninstallApp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Uninstall {uninstallApp?.app.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the app from your workspace and revoke all permissions. 
              Any webhooks and stored data will be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => uninstallApp && handleUninstall(uninstallApp)}
              disabled={isUninstalling}
              className="bg-red-600 hover:bg-red-700"
            >
              {isUninstalling ? 'Uninstalling...' : 'Uninstall'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

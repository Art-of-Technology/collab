'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Store, 
  Search, 
  Download, 
  Shield, 
  ExternalLink,
  Filter,
  Sparkles 
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface AvailableApp {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  publisherId: string;
  scopes: Array<{
    scope: string;
  }>;
  permissions: {
    org: boolean;
    user: boolean;
  };
}

interface AppStoreDiscoveryProps {
  workspaceId: string;
  workspaceSlug: string;
  availableApps: AvailableApp[];
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'workspace:read': 'Read workspace information',
  'issues:read': 'Read issues and tasks',
  'issues:write': 'Create and modify issues',
  'projects:read': 'Read project information',
  'projects:write': 'Create and modify projects',
  'comments:read': 'Read comments',
  'comments:write': 'Create and modify comments',
  'users:read': 'Read user information',
  'webhooks:manage': 'Manage webhooks and receive events',
};

export default function AppStoreDiscovery({ 
  workspaceId, 
  workspaceSlug, 
  availableApps 
}: AppStoreDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AvailableApp | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const router = useRouter();

  // Filter apps based on search and filter criteria
  const filteredApps = availableApps.filter((app) => {
    const matchesSearch = !searchQuery || 
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.publisherId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterBy === 'all' || 
      (filterBy === 'first-party' && app.publisherId === 'weezboo') ||
      (filterBy === 'third-party' && app.publisherId !== 'weezboo') ||
      (filterBy === 'integration' && app.scopes.some(p => p.scope.includes('webhook'))) ||
      (filterBy === 'productivity' && app.scopes.some(p => p.scope.includes('issues') || p.scope.includes('projects')));

    return matchesSearch && matchesFilter;
  });

  const handleInstall = async (app: AvailableApp) => {
    setIsInstalling(true);
    try {
      // Use the server action which will handle the entire flow
      const { installApp } = await import('@/actions/appInstallation');
      const formData = new FormData();
      formData.append('appSlug', app.slug);
      formData.append('workspaceId', workspaceId);
      formData.append('workspaceSlug', workspaceSlug);
      formData.append('scopes', JSON.stringify(app.scopes.map(s => s.scope)));
      
      await installApp(formData);
      // The server action will handle the redirect to OAuth
      
    } catch (error) {
      console.error('Error installing app:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to install app');
    } finally {
      setIsInstalling(false);
    }
  };

  const getScopeIcon = (scope: string) => {
    if (scope.includes('read')) return <Shield className="w-3 h-3 text-blue-500" />;
    if (scope.includes('write')) return <Shield className="w-3 h-3 text-orange-500" />;
    if (scope.includes('manage')) return <Shield className="w-3 h-3 text-red-500" />;
    return <Shield className="w-3 h-3 text-gray-500" />;
  };

  if (availableApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Store className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">All apps installed</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          You have all available apps installed in this workspace. Check back later for new apps and integrations.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Apps</SelectItem>
              <SelectItem value="first-party">First-party</SelectItem>
              <SelectItem value="third-party">Third-party</SelectItem>
              <SelectItem value="integration">Integrations</SelectItem>
              <SelectItem value="productivity">Productivity</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Apps Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredApps.map((app) => (
            <Card key={app.id} className="group hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-3">
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
                      <Store className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <CardTitle className="text-sm font-medium">{app.name}</CardTitle>
                    <CardDescription className="text-xs">
                      by {app.publisherId}
                    </CardDescription>
                  </div>
                  {app.publisherId === 'weezboo' && (
                    <Badge variant="secondary" className="text-xs">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Official
                    </Badge>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Permissions Preview */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Permissions:</p>
                    <div className="flex flex-wrap gap-1">
                      {app.scopes.slice(0, 3).map((permission, index) => (
                        <Badge key={index} variant="outline" className="text-xs flex items-center gap-1">
                          {getScopeIcon(permission.scope)}
                          {permission.scope.split(':')[0]}
                        </Badge>
                      ))}
                      {app.scopes.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{app.scopes.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => setSelectedApp(app)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Install
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => router.push(`/apps/${app.slug}`)}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredApps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No apps found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Try adjusting your search query or filters to find the apps you're looking for.
            </p>
          </div>
        )}
      </div>

      {/* Install Confirmation Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedApp?.iconUrl ? (
                <Image
                  src={selectedApp.iconUrl}
                  alt={`${selectedApp.name} icon`}
                  width={32}
                  height={32}
                  className="rounded-lg border"
                />
              ) : (
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                  <Store className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              Install {selectedApp?.name}
            </DialogTitle>
            <DialogDescription>
              This app will be installed in your workspace and will have access to the following permissions:
            </DialogDescription>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              {/* Permissions List */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Required Permissions:</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedApp.scopes.map((permission, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      {getScopeIcon(permission.scope)}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{permission.scope}</p>
                        <p className="text-xs text-muted-foreground">
                          {SCOPE_DESCRIPTIONS[permission.scope] || 'Access to this feature'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Publisher Info */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Published by <span className="font-medium">{selectedApp.publisherId}</span>
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedApp(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedApp && handleInstall(selectedApp)}
              disabled={isInstalling}
            >
              {isInstalling ? 'Installing...' : 'Install App'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import { useState } from 'react';
import { Session } from 'next-auth';
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
  Sparkles,
  LogIn
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import WorkspaceSelector from './WorkspaceSelector';
import Image from 'next/image';

interface GlobalApp {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  publisherId: string;
  status: string;
  createdAt: Date;
  scopes: Array<{
    scope: string;
  }>;
  permissions: {
    org: boolean;
    user: boolean;
  };
  _count: {
    installations: number;
  };
}

interface GlobalAppDiscoveryProps {
  apps: GlobalApp[];
  userSession: Session | null;
  showFeatured?: boolean;
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

export default function GlobalAppDiscovery({ 
  apps, 
  userSession, 
  showFeatured = true 
}: GlobalAppDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [selectedApp, setSelectedApp] = useState<GlobalApp | null>(null);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const router = useRouter();

  // Filter and sort apps
  const filteredAndSortedApps = apps
    .filter((app) => {
      const matchesSearch = !searchQuery || 
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.publisherId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = filterBy === 'all' || 
        (filterBy === 'first-party' && app.publisherId === 'weezboo') ||
        (filterBy === 'third-party' && app.publisherId !== 'weezboo') ||
        (filterBy === 'integration' && app.scopes.some(s => s.scope.includes('webhook'))) ||
        (filterBy === 'productivity' && app.scopes.some(s => s.scope.includes('issues') || s.scope.includes('projects')));

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b._count.installations - a._count.installations;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const handleInstallClick = (app: GlobalApp) => {
    if (!userSession) {
      toast.error('Please sign in to install apps');
      router.push('/login');
      return;
    }
    
    setSelectedApp(app);
    setShowWorkspaceSelector(true);
  };

  const handleWorkspaceSelected = (workspaceId: string, workspaceSlug: string) => {
    if (!selectedApp) return;
    
    // Navigate to the workspace-specific app installation page
    router.push(`/${workspaceSlug}/apps/${selectedApp.slug}`);
  };

  const getScopeIcon = (scope: string) => {
    if (scope.includes('read')) return <Shield className="w-3 h-3 text-blue-500" />;
    if (scope.includes('write')) return <Shield className="w-3 h-3 text-orange-500" />;
    if (scope.includes('manage')) return <Shield className="w-3 h-3 text-red-500" />;
    return <Shield className="w-3 h-3 text-gray-500" />;
  };

  const getPopularityBadge = (installCount: number) => {
    if (installCount >= 100) return { label: 'Popular', color: 'bg-green-100 text-green-800' };
    if (installCount >= 50) return { label: 'Rising', color: 'bg-blue-100 text-blue-800' };
    if (installCount >= 10) return { label: 'Growing', color: 'bg-purple-100 text-purple-800' };
    return null;
  };

  return (
    <>
      <div className="space-y-6">
        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Discover Apps</CardTitle>
            <CardDescription>
              Find the perfect apps to enhance your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
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
                  <SelectItem value="first-party">Official</SelectItem>
                  <SelectItem value="third-party">Third-party</SelectItem>
                  <SelectItem value="integration">Integrations</SelectItem>
                  <SelectItem value="productivity">Productivity</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredAndSortedApps.length === apps.length 
              ? `${apps.length} apps available`
              : `${filteredAndSortedApps.length} of ${apps.length} apps`
            }
          </p>
        </div>

        {/* Apps Grid */}
        {filteredAndSortedApps.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No apps found</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Try adjusting your search query or filters to find the apps you're looking for.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAndSortedApps.map((app) => {
              const popularityBadge = getPopularityBadge(app._count.installations);
              
              return (
                <Card key={app.id} className="group hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {app.iconUrl ? (
                          <Image
                            src={app.iconUrl}
                            alt={`${app.name} icon`}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-lg border object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                            <Store className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">{app.name}</CardTitle>
                          <CardDescription className="text-sm truncate">
                            by {app.publisherId}
                          </CardDescription>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        {app.publisherId === 'weezboo' && (
                          <Badge variant="secondary" className="text-xs">
                            <Sparkles className="w-3 h-3 mr-1" />
                            Official
                          </Badge>
                        )}
                        {popularityBadge && (
                          <Badge variant="outline" className={`text-xs ${popularityBadge.color}`}>
                            {popularityBadge.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {/* Permissions Preview */}
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {app.scopes.slice(0, 3).map((scope, index) => (
                            <Badge key={index} variant="outline" className="text-xs flex items-center gap-1">
                              {getScopeIcon(scope.scope)}
                              {scope.scope.split(':')[0]}
                            </Badge>
                          ))}
                          {app.scopes.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{app.scopes.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{app._count.installations} installs</span>
                        <span>{new Date(app.createdAt).toLocaleDateString()}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 text-xs h-8"
                          onClick={() => handleInstallClick(app)}
                        >
                          {userSession ? (
                            <>
                              <Download className="w-3 h-3 mr-1" />
                              Install
                            </>
                          ) : (
                            <>
                              <LogIn className="w-3 h-3 mr-1" />
                              Sign in to Install
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 px-2"
                          onClick={() => router.push(`/apps/${app.slug}`)}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Workspace Selection Dialog */}
      <Dialog open={showWorkspaceSelector} onOpenChange={setShowWorkspaceSelector}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedApp?.iconUrl ? (
                <Image
                  src={selectedApp.iconUrl}
                  alt={`${selectedApp.name} icon`}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-lg border"
                />
              ) : (
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                  <Store className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              Install {selectedApp?.name}
            </DialogTitle>
            <DialogDescription>
              Choose which workspace to install this app in.
            </DialogDescription>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              {/* App Info */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">API Scopes Required:</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedApp.scopes.length} scopes
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedApp.scopes.map((scope, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {scope.scope}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Workspace Selector */}
              <WorkspaceSelector
                onWorkspaceSelected={handleWorkspaceSelected}
                userSession={userSession}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkspaceSelector(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

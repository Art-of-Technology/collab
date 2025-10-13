'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Github, 
  Search, 
  ExternalLink, 
  Check, 
  Loader2, 
  Star, 
  GitBranch, 
  Lock, 
  Globe,
  AlertCircle,
  RefreshCw,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type: 'User' | 'Organization';
  };
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  isConnected: boolean;
  connectedProject?: {
    id: string;
    name: string;
  };
}

interface GitHubOAuthConnectionProps {
  projectId: string;
  onSuccess?: () => void;
}

export function GitHubOAuthConnection({ projectId, onSuccess }: GitHubOAuthConnectionProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    checkGitHubConnection();
  }, []);

  useEffect(() => {
    if (isConnected) {
      fetchRepositories();
    }
  }, [isConnected, currentPage]);

  useEffect(() => {
    filterRepositories();
  }, [repositories, searchTerm]);

  const checkGitHubConnection = async () => {
    try {
      console.log('Checking GitHub connection...');
      const response = await fetch('/api/github/oauth/repositories');
      console.log('GitHub connection check response:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('GitHub connected, user:', data.githubUser);
        setIsConnected(true);
        setGithubUser(data.githubUser);
        setRepositories(data.repositories || []);
        setHasMore(data.hasMore || false);
      } else {
        // GitHub not connected or token expired
        console.log('GitHub not connected, resetting state');
        setIsConnected(false);
        setGithubUser(null);
        setRepositories([]);
        setFilteredRepos([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error checking GitHub connection:', error);
      // On error, assume not connected
      console.log('GitHub connection error, resetting state');
      setIsConnected(false);
      setGithubUser(null);
      setRepositories([]);
      setFilteredRepos([]);
      setHasMore(false);
    }
  };

  const fetchRepositories = async (page = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/github/oauth/repositories?page=${page}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch repositories');
      }

      const data = await response.json();
      
      if (page === 1) {
        setRepositories(data.repositories || []);
      } else {
        setRepositories(prev => [...prev, ...(data.repositories || [])]);
      }
      
      setHasMore(data.hasMore || false);
      setGithubUser(data.githubUser);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch repositories');
    } finally {
      setLoading(false);
    }
  };

  const filterRepositories = () => {
    if (!searchTerm) {
      setFilteredRepos(repositories);
      return;
    }

    const filtered = repositories.filter(repo =>
      repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredRepos(filtered);
  };

  const handleGitHubConnect = async () => {
    try {
      const state = `project:${projectId}`;
      
      // Get OAuth URL from server
      const response = await fetch(`/api/github/oauth/auth-url?state=${encodeURIComponent(state)}`);
      if (!response.ok) {
        throw new Error('Failed to generate OAuth URL');
      }
      
      const { authUrl } = await response.json();
      
      // Open in popup window
      const popup = window.open(
        authUrl,
        'github-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      // Listen for popup close
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          // Check if connection was successful
          setTimeout(() => {
            checkGitHubConnection();
          }, 1000);
        }
      }, 1000);
    } catch (error) {
      console.error('Error starting GitHub OAuth:', error);
      toast.error('Failed to start GitHub connection');
    }
  };

  const handleRepositoryConnect = async (repo: GitHubRepository) => {
    if (repo.isConnected) {
      toast.error(`Repository is already connected to project "${repo.connectedProject?.name}"`);
      return;
    }

    if (!repo.permissions.admin) {
      toast.error('You need admin access to this repository to connect it');
      return;
    }

    setConnecting(repo.id.toString());
    
    try {
      const response = await fetch('/api/github/oauth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          repositoryId: repo.id,
          owner: repo.owner.login,
          name: repo.name,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to connect repository');
      }

      const data = await response.json();
      
      // Show success message with optional warning
      if (data.warning) {
        toast.warning(
          <div>
            <div className="font-medium">Repository connected with limitations</div>
            <div className="text-sm text-muted-foreground mt-1">
              {data.warning}
            </div>
          </div>,
          { duration: 8000 } // Show longer for warnings
        );
      } else {
        toast.success(
          <div>
            <div className="font-medium">Repository connected successfully!</div>
            <div className="text-sm text-muted-foreground mt-1">
              Webhook configured automatically
            </div>
          </div>
        );
      }

      // Update repository status
      setRepositories(prev => 
        prev.map(r => 
          r.id === repo.id 
            ? { ...r, isConnected: true }
            : r
        )
      );

      onSuccess?.();
      
    } catch (error) {
      console.error('Error connecting repository:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to connect repository');
    } finally {
      setConnecting(null);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleDisconnectGitHub = async () => {
    try {
      // Clear GitHub connection from user account
      const response = await fetch('/api/github/oauth/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect GitHub account');
      }

      toast.success('GitHub account disconnected successfully');
      
      // Reset search term
      setSearchTerm('');
      
      // Re-check connection status (this will reset all state properly)
      await checkGitHubConnection();
      
      // Trigger parent component update
      onSuccess?.();
    } catch (error) {
      console.error('Error disconnecting GitHub:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect GitHub account');
    }
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Connect with GitHub
          </CardTitle>
          <CardDescription>
            Connect your GitHub account to access your repositories and enable seamless integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center p-8 border-2 border-dashed border-muted rounded-lg">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                <Github className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-medium">No GitHub account connected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your GitHub account to browse and select repositories
                </p>
              </div>
              <Button onClick={handleGitHubConnect} className="gap-2">
                <Github className="h-4 w-4" />
                Connect with GitHub
              </Button>
            </div>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <span>One-click repository connection</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <span>Automatic webhook configuration</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <span>No manual setup required</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Select Repository
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <img 
                src={`https://github.com/${githubUser}.png`} 
                alt={githubUser || ''} 
                className="w-6 h-6 rounded-full"
              />
              <span>@{githubUser}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnectGitHub}
              className="text-muted-foreground hover:text-destructive"
            >
              Disconnect
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Choose a repository to connect to this project. Webhooks will be configured automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Repository List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {loading && repositories.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No repositories match your search' : 'No repositories found'}
            </div>
          ) : (
            filteredRepos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{repo.name}</h4>
                    <div className="flex items-center gap-1">
                      {repo.private ? (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Globe className="h-3 w-3 text-muted-foreground" />
                      )}
                      {repo.language && (
                        <Badge variant="outline" className="text-xs">
                          {repo.language}
                        </Badge>
                      )}
                      {repo.stargazers_count > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3" />
                          {repo.stargazers_count}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground truncate">
                    {repo.description || 'No description'}
                  </p>
                  
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{repo.owner.login}</span>
                    <div className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {repo.default_branch}
                    </div>
                    <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {repo.isConnected ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <Check className="h-4 w-4" />
                      <span className="text-sm">Connected</span>
                    </div>
                  ) : !repo.permissions.admin ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">No admin access</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleRepositoryConnect(repo)}
                      disabled={connecting === repo.id.toString()}
                      size="sm"
                    >
                      {connecting === repo.id.toString() ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  )}
                  
                  <Button variant="ghost" size="sm" asChild>
                    <a 
                      href={`https://github.com/${repo.full_name}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Load More */}
        {hasMore && !searchTerm && (
          <div className="text-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Load More
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

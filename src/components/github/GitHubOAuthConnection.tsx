'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  compact?: boolean;
}

export function GitHubOAuthConnection({ projectId, onSuccess, compact = false }: GitHubOAuthConnectionProps) {
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
    // Compact mode - just a button (used inside ProjectSettingsClient)
    if (compact) {
      return (
        <Button
          onClick={handleGitHubConnect}
          className="h-10 px-5 bg-collab-700 hover:bg-collab-600 text-collab-50 border border-collab-600 hover:border-collab-600 transition-colors"
        >
          <Github className="h-4 w-4 mr-2" />
          Connect GitHub Account
        </Button>
      );
    }

    // Full card mode - shown when GitHub account is not connected
    return (
      <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-collab-700">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-collab-50" />
            <h2 className="text-sm font-medium text-collab-50">Connect Repository</h2>
          </div>
          <p className="text-xs text-collab-500/60 mt-0.5">
            Link a GitHub repository to enable powerful integrations
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            {/* Icon */}
            <div className="relative w-16 h-16 mb-5">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#27272b] to-[#1f1f22] flex items-center justify-center">
                <Github className="h-8 w-8 text-collab-500" />
              </div>
            </div>

            <h3 className="text-base font-medium text-collab-50 mb-2">
              Connect your GitHub account
            </h3>
            <p className="text-sm text-collab-500 mb-6 max-w-sm">
              Connect your GitHub account to browse repositories and enable automatic syncing.
            </p>

            <Button
              onClick={handleGitHubConnect}
              className="h-10 px-6 bg-collab-700 hover:bg-collab-600 text-collab-50 border border-collab-600 hover:border-collab-600 transition-colors"
            >
              <Github className="h-4 w-4 mr-2" />
              Connect with GitHub
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-collab-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-collab-50" />
            <h2 className="text-sm font-medium text-collab-50">Select Repository</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <img
                src={`https://github.com/${githubUser}.png`}
                alt={githubUser || ''}
                className="w-5 h-5 rounded-full ring-1 ring-collab-600"
              />
              <span className="text-xs text-collab-400">@{githubUser}</span>
            </div>
            <button
              onClick={handleDisconnectGitHub}
              className="text-xs text-collab-500/60 hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
        <p className="text-xs text-collab-500/60 mt-2">
          Choose a repository to connect to this project. Webhooks will be configured automatically.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-collab-500/60" />
          <Input
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 pl-10 bg-collab-900 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-collab-500/50 focus-visible:ring-0"
          />
        </div>

        {/* Repository List */}
        <div className="space-y-2">
          {loading && repositories.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-collab-500/60" />
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="text-center py-16 text-sm text-collab-500/60">
              {searchTerm ? 'No repositories match your search' : 'No repositories found'}
            </div>
          ) : (
            filteredRepos.map((repo) => (
              <div
                key={repo.id}
                className={cn(
                  "group p-4 rounded-xl bg-collab-900 border border-collab-700 hover:border-collab-600 transition-colors",
                  repo.isConnected && "border-emerald-500/30 bg-emerald-500/5"
                )}
              >
                {/* Top section - always horizontal */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Repo Icon */}
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-collab-700 flex items-center justify-center">
                      {repo.private ? (
                        <Lock className="h-4 w-4 text-collab-500" />
                      ) : (
                        <Github className="h-4 w-4 text-collab-500" />
                      )}
                    </div>

                    {/* Name and badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-collab-50">{repo.name}</h4>
                        {repo.private && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-collab-600 text-collab-500 flex-shrink-0">
                            Private
                          </span>
                        )}
                        {repo.language && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-collab-700 text-collab-400 flex-shrink-0">
                            {repo.language}
                          </span>
                        )}
                      </div>
                      {/* Description */}
                      <p className="text-xs text-collab-500 mt-1 line-clamp-1">
                        {repo.description || 'No description'}
                      </p>
                    </div>
                  </div>

                  {/* External link - always visible */}
                  <a
                    href={`https://github.com/${repo.full_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1.5 rounded-md text-collab-500/60 hover:text-collab-400 hover:bg-collab-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                {/* Bottom section - meta and actions */}
                <div className="flex items-center justify-between gap-4 pl-12">
                  {/* Meta Row */}
                  <div className="flex items-center gap-3 text-[11px] text-collab-500/60 flex-wrap">
                    <span className="flex-shrink-0">{repo.owner.login}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <GitBranch className="h-3 w-3" />
                      {repo.default_branch}
                    </div>
                    <span className="flex-shrink-0 hidden sm:inline">
                      Updated {new Date(repo.updated_at).toLocaleDateString()}
                    </span>
                    {repo.stargazers_count > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Star className="h-3 w-3" />
                        {repo.stargazers_count}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0">
                    {repo.isConnected ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 px-2 py-1 rounded-md bg-emerald-500/10">
                        <Check className="h-3.5 w-3.5" />
                        Connected
                      </span>
                    ) : !repo.permissions.admin ? (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400 px-2 py-1 rounded-md bg-amber-500/10">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">No admin access</span>
                        <span className="sm:hidden">No access</span>
                      </span>
                    ) : (
                      <Button
                        onClick={() => handleRepositoryConnect(repo)}
                        disabled={connecting === repo.id.toString()}
                        size="sm"
                        className="h-7 px-3 text-xs bg-blue-500 hover:bg-blue-400 text-white border-0"
                      >
                        {connecting === repo.id.toString() ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Load More */}
        {hasMore && !searchTerm && (
          <div className="pt-3 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="flex items-center gap-2 h-9 px-4 text-xs text-collab-500 hover:text-collab-50 bg-collab-900 hover:bg-collab-700 border border-collab-700 hover:border-collab-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Load More Repositories
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Eye,
  EyeOff,
  Save,
  Trash2,
  Loader2,
  ExternalLink,
  Check,
  GitBranch,
  GitPullRequest,
  Shield,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubStatus {
  configured: boolean;
  lastUpdated: string | null;
  defaultOwner?: string;
  defaultRepo?: string;
}

// ---------------------------------------------------------------------------
// GitHubIntegration Component
// ---------------------------------------------------------------------------

interface GitHubIntegrationProps {
  workspaceId: string;
}

export default function GitHubIntegration({ workspaceId }: GitHubIntegrationProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [token, setToken] = useState('');
  const [defaultOwner, setDefaultOwner] = useState('');
  const [defaultRepo, setDefaultRepo] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/github`);
      if (res.ok) {
        const data = await res.json() as GitHubStatus;
        setStatus(data);
        if (data.defaultOwner) setDefaultOwner(data.defaultOwner);
        if (data.defaultRepo) setDefaultRepo(data.defaultRepo);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub status:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSave = async () => {
    if (!token.trim()) {
      toast({ title: 'Token required', description: 'Please enter your GitHub personal access token', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          defaultOwner: defaultOwner.trim() || undefined,
          defaultRepo: defaultRepo.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to save');
      }

      toast({ title: 'GitHub connected', description: 'Your token has been securely stored' });
      setToken('');
      setIsEditing(false);
      await fetchStatus();
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/github`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to disconnect');
      }

      toast({ title: 'GitHub disconnected', description: 'Your token has been removed' });
      setStatus({ configured: false, lastUpdated: null });
      setDefaultOwner('');
      setDefaultRepo('');
      setIsEditing(false);
    } catch (err) {
      toast({
        title: 'Failed to disconnect',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-collab-900 border-collab-700">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-collab-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main GitHub Card */}
      <Card className="bg-collab-900 border-collab-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-white text-lg">GitHub Integration</CardTitle>
                <CardDescription className="text-collab-400">
                  Enable Coclaw to manage repositories, pull requests, issues, and deployments
                </CardDescription>
              </div>
            </div>
            {status?.configured && (
              <Badge className="bg-emerald-900/50 text-emerald-400 border-emerald-700">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Connected state */}
          {status?.configured && !isEditing && (
            <div className="space-y-4">
              {/* Capabilities */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-collab-800 border border-collab-700">
                  <GitPullRequest className="h-4 w-4 text-violet-400" />
                  <span className="text-sm text-collab-300">Pull Requests</span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-collab-800 border border-collab-700">
                  <GitBranch className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-collab-300">Branches & Releases</span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-collab-800 border border-collab-700">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-collab-300">Git Push & Deploy</span>
                </div>
              </div>

              {/* Config info */}
              {(status.defaultOwner || status.defaultRepo) && (
                <div className="p-3 rounded-lg bg-collab-800 border border-collab-700">
                  <p className="text-xs text-collab-500 mb-1">Default Repository</p>
                  <p className="text-sm text-white font-mono">
                    {status.defaultOwner && status.defaultRepo
                      ? `${status.defaultOwner}/${status.defaultRepo}`
                      : status.defaultOwner || status.defaultRepo}
                  </p>
                </div>
              )}

              {status.lastUpdated && (
                <p className="text-xs text-collab-500">
                  Connected {new Date(status.lastUpdated).toLocaleDateString()}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="border-collab-600 text-collab-300 hover:text-white"
                >
                  Update Token
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={deleting}
                  className="border-red-800 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  {deleting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  Disconnect
                </Button>
              </div>
            </div>
          )}

          {/* Setup / Edit form */}
          {(!status?.configured || isEditing) && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-800/30">
                <p className="text-sm text-blue-300">
                  Connect a GitHub personal access token to let Coclaw create PRs, manage issues,
                  push code, and trigger deployments on your behalf.
                </p>
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  Create a fine-grained PAT on GitHub
                </a>
              </div>

              {/* Token input */}
              <div>
                <label className="text-sm text-collab-400 mb-1 block">Personal Access Token</label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                    className="bg-collab-800 border-collab-600 text-white pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-collab-400 hover:text-white"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-collab-500 mt-1">
                  Required scopes: <code className="text-collab-400">repo</code>, <code className="text-collab-400">workflow</code> (optional)
                </p>
              </div>

              <Separator className="bg-collab-700" />

              {/* Optional defaults */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-collab-400 mb-1 block">Default Owner (optional)</label>
                  <Input
                    type="text"
                    value={defaultOwner}
                    onChange={(e) => setDefaultOwner(e.target.value)}
                    placeholder="my-org or my-username"
                    className="bg-collab-800 border-collab-600 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-collab-400 mb-1 block">Default Repository (optional)</label>
                  <Input
                    type="text"
                    value={defaultRepo}
                    onChange={(e) => setDefaultRepo(e.target.value)}
                    placeholder="my-project"
                    className="bg-collab-800 border-collab-600 text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={saving || !token.trim()}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {status?.configured ? 'Update Token' : 'Connect GitHub'}
                </Button>
                {isEditing && (
                  <Button
                    variant="outline"
                    onClick={() => { setIsEditing(false); setToken(''); }}
                    className="border-collab-600 text-collab-300"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security note */}
      <Card className="bg-collab-900/50 border-collab-700">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-collab-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-collab-400">
                Your token is encrypted at rest using AES-256-GCM and is only decrypted when
                spawning your Coclaw instance. It is never logged or exposed in the UI.
              </p>
              <p className="text-xs text-collab-500 mt-1">
                The token is automatically injected as <code className="text-collab-400">GITHUB_TOKEN</code> and configured
                as a git credential helper so <code className="text-collab-400">git push</code>, <code className="text-collab-400">gh</code> CLI,
                and the GitHub API tool all work seamlessly.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

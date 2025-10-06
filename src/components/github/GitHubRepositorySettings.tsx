'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Github, CheckCircle, AlertCircle, ExternalLink, GitBranch, GitPullRequest, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Repository {
  id: string;
  projectId: string;
  owner: string;
  name: string;
  fullName: string;
  isActive: boolean;
  syncedAt: string;
  webhookSecret: string;
  branches?: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    updatedAt: string;
  }>;
  pullRequests?: Array<{
    id: string;
    githubPrId: number;
    title: string;
    state: string;
    githubUpdatedAt: string;
  }>;
  versions?: Array<{
    id: string;
    version: string;
    status: string;
    createdAt: string;
  }>;
  _count?: {
    branches: number;
    pullRequests: number;
    commits: number;
    versions: number;
  };
}

interface GitHubRepositorySettingsProps {
  projectId: string;
  repository?: Repository;
  onUpdate?: () => void;
}

export function GitHubRepositorySettings({ projectId, repository, onUpdate }: GitHubRepositorySettingsProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(!repository);
  const [formData, setFormData] = useState({
    owner: '',
    name: '',
    githubRepoId: '',
    accessToken: '',
  });

  const handleConnect = async () => {
    if (!formData.owner || !formData.name || !formData.githubRepoId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsConnecting(true);
    try {
      const response = await fetch('/api/github/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          githubRepoId: parseInt(formData.githubRepoId),
          owner: formData.owner,
          name: formData.name,
          accessToken: formData.accessToken || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to connect repository');
      }

      const data = await response.json();
      
      toast.success(
        <div>
          <div className="font-medium">Repository connected successfully!</div>
          <div className="text-sm text-muted-foreground mt-1">
            Webhook secret: <code className="text-xs">{data.repository.webhookSecret}</code>
          </div>
        </div>
      );
      
      setShowConnectionForm(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error connecting repository:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to connect repository');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!repository) return;

    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/github/repositories/${repository.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disconnect repository');
      }

      toast.success('Repository disconnected successfully');
      setShowConnectionForm(true);
      onUpdate?.();
    } catch (error) {
      console.error('Error disconnecting repository:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect repository');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/github/webhooks/events`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  };

  const copyWebhookSecret = () => {
    if (repository?.webhookSecret) {
      navigator.clipboard.writeText(repository.webhookSecret);
      toast.success('Webhook secret copied to clipboard');
    }
  };

  if (showConnectionForm || !repository) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Connect GitHub Repository
          </CardTitle>
          <CardDescription>
            Connect your GitHub repository to enable version tracking, AI code reviews, and automated changelog generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="owner">Repository Owner</Label>
              <Input
                id="owner"
                placeholder="e.g., microsoft"
                value={formData.owner}
                onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="name">Repository Name</Label>
              <Input
                id="name"
                placeholder="e.g., vscode"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="githubRepoId">GitHub Repository ID</Label>
            <Input
              id="githubRepoId"
              placeholder="e.g., 41881900"
              value={formData.githubRepoId}
              onChange={(e) => setFormData(prev => ({ ...prev, githubRepoId: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Find this in your GitHub repository's API URL or settings
            </p>
          </div>

          <div>
            <Label htmlFor="accessToken">GitHub Access Token (Optional)</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="ghp_..."
              value={formData.accessToken}
              onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Required for private repositories or advanced features
            </p>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              After connecting, you'll need to configure a webhook in your GitHub repository settings.
              We'll provide the webhook URL and secret after connection.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect Repository
            </Button>
            {repository && (
              <Button 
                variant="outline" 
                onClick={() => setShowConnectionForm(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Repository Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {repository.fullName}
            </div>
            <Badge variant={repository.isActive ? "default" : "secondary"}>
              {repository.isActive ? "Active" : "Inactive"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Connected repository for version tracking and automated workflows
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{repository._count?.branches || 0}</div>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <GitBranch className="h-3 w-3" />
                Branches
              </p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{repository._count?.pullRequests || 0}</div>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <GitPullRequest className="h-3 w-3" />
                Pull Requests
              </p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{repository._count?.commits || 0}</div>
              <p className="text-sm text-muted-foreground">Commits</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{repository._count?.versions || 0}</div>
              <p className="text-sm text-muted-foreground">Versions</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last synced: {new Date(repository.syncedAt).toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Configure GitHub webhooks to enable real-time updates and automated workflows
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/api/github/webhooks/events`}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
                Copy
              </Button>
            </div>
          </div>

          <div>
            <Label>Webhook Secret</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                type="password"
                value={repository.webhookSecret}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="sm" onClick={copyWebhookSecret}>
                Copy
              </Button>
            </div>
          </div>

          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>To complete the setup, add this webhook to your GitHub repository:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Go to your repository Settings → Webhooks</li>
                  <li>Click "Add webhook"</li>
                  <li>Paste the webhook URL above</li>
                  <li>Set Content type to "application/json"</li>  
                  <li>Paste the webhook secret above</li>
                  <li>Select "Send me everything" or choose specific events</li>
                  <li>Click "Add webhook"</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          <Button variant="outline" asChild>
            <a 
              href={`https://github.com/${repository.fullName}/settings/hooks`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open GitHub Webhook Settings
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      {(repository.branches || repository.pullRequests || repository.versions) && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {repository.branches && repository.branches.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Recent Branches
                </h4>
                <div className="space-y-2">
                  {repository.branches.slice(0, 3).map((branch) => (
                    <div key={branch.id} className="flex items-center justify-between py-2 px-3 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <code className="text-sm">{branch.name}</code>
                        {branch.isDefault && <Badge variant="secondary" className="text-xs">default</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(branch.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {repository.pullRequests && repository.pullRequests.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4" />
                  Recent Pull Requests
                </h4>
                <div className="space-y-2">
                  {repository.pullRequests.slice(0, 3).map((pr) => (
                    <div key={pr.id} className="flex items-center justify-between py-2 px-3 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">#{pr.githubPrId}</span>
                        <span className="text-sm truncate">{pr.title}</span>
                        <Badge variant={pr.state === 'OPEN' ? 'default' : 'secondary'} className="text-xs">
                          {pr.state.toLowerCase()}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(pr.githubUpdatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {repository.versions && repository.versions.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recent Versions</h4>
                <div className="space-y-2">
                  {repository.versions.slice(0, 3).map((version) => (
                    <div key={version.id} className="flex items-center justify-between py-2 px-3 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <code className="text-sm">v{version.version}</code>
                        <Badge variant={version.status === 'RELEASED' ? 'default' : 'secondary'} className="text-xs">
                          {version.status.toLowerCase()}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Actions */}
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={() => setShowConnectionForm(true)}
        >
          Reconfigure
        </Button>
        <Button 
          variant="destructive" 
          onClick={handleDisconnect}
          disabled={isDisconnecting}
        >
          {isDisconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Disconnect Repository
        </Button>
      </div>
    </div>
  );
}

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
import { GitHubOAuthConnection } from './GitHubOAuthConnection';
import { BranchConfiguration } from './BranchConfiguration';

interface Repository {
  id: string;
  projectId: string;
  owner: string;
  name: string;
  fullName: string;
  isActive: boolean;
  syncedAt: Date | null;
  webhookSecret: string;
  webhookId?: string | null;
  defaultBranch: string;
  developmentBranch?: string;
  versioningStrategy: 'SINGLE_BRANCH' | 'MULTI_BRANCH';
  branchEnvironmentMap?: Record<string, string>;
  issueTypeMapping?: Record<string, 'MAJOR' | 'MINOR' | 'PATCH'>;
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
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Debug: Log repository data
  console.log('Repository data:', repository);

  const handleDisconnect = async () => {
    if (!repository) return;

    console.log('Attempting to disconnect repository:', {
      id: repository.id,
      fullName: repository.fullName,
      projectId: repository.projectId
    });

    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/github/repositories/${repository.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Disconnect failed:', {
          status: response.status,
          statusText: response.statusText,
          error: error.error,
          repositoryId: repository.id
        });
        throw new Error(error.error || `Failed to disconnect repository (${response.status})`);
      }

      toast.success('Repository disconnected successfully');
      // Repository disconnected, component will re-render
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

  // If no repository connected, show OAuth connection
  if (!repository) {
    return (
      <div className="space-y-6">
        <GitHubOAuthConnection 
          projectId={projectId} 
          onSuccess={onUpdate} 
        />
        
        {/* Manual connection fallback */}
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowManualForm(!showManualForm)}
            className="text-muted-foreground"
          >
            Need manual setup? Click here
          </Button>
        </div>

        {showManualForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Manual Repository Connection
              </CardTitle>
              <CardDescription>
                Use this if OAuth doesn't work for your setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Manual setup requires technical knowledge and is not recommended. 
                  Use OAuth connection above for the best experience.
                </AlertDescription>
              </Alert>
              
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Manual setup is temporarily disabled. Please use OAuth connection above.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Repository is connected, show status and management
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
            Last synced: {repository.syncedAt ? new Date(repository.syncedAt).toLocaleString() : 'Never'}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            {repository.webhookId 
              ? "Webhook configured automatically for real-time GitHub events"
              : "Configure GitHub webhooks to enable real-time updates and automated workflows"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {repository.webhookId ? (
            // Webhook was created automatically
            <>
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium text-green-700">Webhook configured successfully!</p>
                    <p className="text-sm">
                      Your repository is now connected and will receive real-time updates for:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                      <li>Push events and commits</li>
                      <li>Pull request activities</li>
                      <li>Release and deployment events</li>
                      <li>Branch and tag creation/deletion</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Webhook Active</span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href={`https://github.com/${repository.fullName}/settings/hooks`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View in GitHub
                  </a>
                </Button>
              </div>
            </>
          ) : (
            // Webhook needs manual configuration
            <>
              <Alert>
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium text-yellow-700">Manual webhook setup required</p>
                    <p className="text-sm">
                      Automatic webhook creation failed. Please configure the webhook manually to enable real-time GitHub events.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

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
            </>
          )}
        </CardContent>
      </Card>

      {/* Branch & Versioning Configuration */}
      <BranchConfiguration 
        repository={repository}
        onUpdate={onUpdate}
      />

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
          onClick={() => setShowManualForm(true)}
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

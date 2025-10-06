'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  GitBranch, 
  GitPullRequest, 
  Tag, 
  ExternalLink, 
  Clock,
  Check,
  X,
  AlertCircle,
  Loader2,
  Code,
  Rocket,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

interface GitHubIntegrationData {
  repository?: {
    id: string;
    fullName: string;
    owner: string;
    name: string;
  };
  branch?: {
    id: string;
    name: string;
    headSha: string;
    createdAt: string;
  };
  pullRequests: Array<{
    id: string;
    githubPrId: number;
    title: string;
    state: 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT';
    githubUrl?: string;
    createdAt: string;
    mergedAt?: string;
    reviews: Array<{
      id: string;
      type: 'AI_GENERATED' | 'HUMAN';
      status: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
      score?: number;
      summary?: string;
      createdAt: string;
    }>;
    checks: Array<{
      id: string;
      name: string;
      status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR';
      conclusion?: string;
      detailsUrl?: string;
    }>;
  }>;
  versions: Array<{
    id: string;
    version: string;
    status: 'PENDING' | 'BUILDING' | 'TESTING' | 'READY' | 'RELEASED';
    environment: string;
    createdAt: string;
    releasedAt?: string;
    deployments: Array<{
      id: string;
      environment: string;
      status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'PENDING';
      deployedAt?: string;
    }>;
  }>;
  commits: Array<{
    id: string;
    sha: string;
    message: string;
    authorName: string;
    commitDate: string;
    githubUrl?: string;
  }>;
}

interface GitHubIssueIntegrationProps {
  issueId: string;
  issueKey: string;
  projectId: string;
  projectSlug?: string;
}

export function GitHubIssueIntegration({ issueId, issueKey, projectId, projectSlug }: GitHubIssueIntegrationProps) {
  const [data, setData] = useState<GitHubIntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    fetchGitHubData();
  }, [issueId]);

  const fetchGitHubData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/issues/${issueId}/github`);
      if (!response.ok) throw new Error('Failed to fetch GitHub data');
      
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching GitHub data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load GitHub integration');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'RELEASED':
      case 'APPROVED':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'FAILURE':
      case 'ERROR':
        return <X className="h-4 w-4 text-red-500" />;
      case 'PENDING':
      case 'IN_PROGRESS':
      case 'BUILDING':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'RELEASED':
      case 'APPROVED':
      case 'MERGED':
        return 'default';
      case 'FAILURE':
      case 'ERROR':
        return 'destructive';
      case 'PENDING':
      case 'IN_PROGRESS':
      case 'BUILDING':
      case 'OPEN':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            GitHub Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.repository) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center py-6">
            <Code className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-2">No GitHub Integration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This issue is not linked to any GitHub activity yet.
            </p>
            {error && (
              <p className="text-sm text-destructive mb-4">{error}</p>
            )}
            <Button variant="outline" onClick={fetchGitHubData}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Repository Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              GitHub Integration
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                if (projectSlug && currentWorkspace?.slug) {
                  router.push(`/${currentWorkspace.slug}/projects/${projectSlug}/changelog`);
                } else {
                  console.error('Missing project slug or workspace slug:', { projectSlug, workspaceSlug: currentWorkspace?.slug });
                }
              }}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              View Changelog
            </Button>
          </CardTitle>
          <CardDescription>
            Connected to {data.repository.fullName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Branch Info */}
          {data.branch && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <div>
                  <code className="text-sm font-medium">{data.branch.name}</code>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(data.branch.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {data.branch.headSha.slice(0, 7)}
              </Badge>
            </div>
          )}

          {/* Commits */}
          {data.commits.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Commits ({data.commits.length})
              </h4>
              <div className="space-y-2">
                {data.commits.slice(0, 3).map((commit) => (
                  <div key={commit.id} className="flex items-start gap-3 p-2 bg-muted/50 rounded">
                    <code className="text-xs mt-1 px-2 py-1 bg-background rounded">
                      {commit.sha.slice(0, 7)}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{commit.message}</p>
                      <p className="text-xs text-muted-foreground">
                        by {commit.authorName} • {new Date(commit.commitDate).toLocaleDateString()}
                      </p>
                    </div>
                    {commit.githubUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={commit.githubUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
                {data.commits.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{data.commits.length - 3} more commits
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pull Requests */}
      {data.pullRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitPullRequest className="h-4 w-4" />
              Pull Requests ({data.pullRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.pullRequests.map((pr) => (
              <div key={pr.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">#{pr.githubPrId}</span>
                    <Badge variant={getStatusColor(pr.state)} className="text-xs">
                      {pr.state.toLowerCase()}
                    </Badge>
                  </div>
                  {pr.githubUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={pr.githubUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </a>
                    </Button>
                  )}
                </div>
                
                <h4 className="font-medium text-sm">{pr.title}</h4>
                
                <div className="text-xs text-muted-foreground">
                  Created {new Date(pr.createdAt).toLocaleDateString()}
                  {pr.mergedAt && (
                    <> • Merged {new Date(pr.mergedAt).toLocaleDateString()}</>
                  )}
                </div>


                {/* Status Checks */}
                {pr.checks.length > 0 && (
                  <div>
                    <h5 className="font-medium text-xs mb-2">
                      Checks ({pr.checks.filter(c => c.status === 'SUCCESS').length}/{pr.checks.length})
                    </h5>
                    <div className="grid grid-cols-1 gap-1">
                      {pr.checks.map((check) => (
                        <div key={check.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(check.status)}
                            <span>{check.name}</span>
                          </div>
                          {check.detailsUrl && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={check.detailsUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Versions & Deployments */}
      {data.versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              Versions & Deployments ({data.versions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.versions.map((version) => (
              <div key={version.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <code className="font-medium">v{version.version}</code>
                    <Badge variant={getStatusColor(version.status)} className="text-xs">
                      {version.status.toLowerCase()}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {version.environment}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {version.releasedAt 
                      ? `Released ${new Date(version.releasedAt).toLocaleDateString()}`
                      : `Created ${new Date(version.createdAt).toLocaleDateString()}`
                    }
                  </div>
                </div>

                {/* Deployments */}
                {version.deployments.length > 0 && (
                  <div>
                    <h5 className="font-medium text-xs mb-2 flex items-center gap-1">
                      <Rocket className="h-3 w-3" />
                      Deployments
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {version.deployments.map((deployment) => (
                        <div key={deployment.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <div>
                            <div className="font-medium text-xs capitalize">{deployment.environment}</div>
                            <div className="text-xs text-muted-foreground">
                              {deployment.deployedAt 
                                ? new Date(deployment.deployedAt).toLocaleDateString()
                                : 'Not deployed'
                              }
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(deployment.status)}
                            <Badge variant={getStatusColor(deployment.status)} className="text-xs">
                              {deployment.status.toLowerCase().replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}


'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  BookOpen,
  ArrowRight,
  CheckCircle,
  XCircle,
  MessageSquare,
  Users,
  Calendar,
  GitCommit,
  Target,
  TrendingUp,
  Eye,
  ThumbsUp,
  ThumbsDown,
  MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

import { GitHubSkeleton } from './GitHubSkeleton';
import { AIReviewsPanel } from './AIReviewsPanel';

interface AIReviewData {
  id: string;
  summary: string;
  findings: {
    security: Array<{ severity: string; message: string; file?: string; line?: number }>;
    bugs: Array<{ severity: string; message: string; file?: string; line?: number }>;
    performance: Array<{ severity: string; message: string; file?: string; line?: number }>;
    codeQuality: Array<{ severity: string; message: string; file?: string; line?: number }>;
    suggestions: Array<{ message: string; file?: string }>;
  };
  fullReview: string;
  filesAnalyzed: number;
  linesAnalyzed: number;
  issuesFound: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  triggerType: 'AUTOMATIC' | 'MANUAL';
  postedToGitHub: boolean;
  githubCommentId?: string;
  errorMessage?: string;
  createdAt: string;
  triggeredBy?: {
    id: string;
    name: string;
    image?: string;
  };
  pullRequest?: {
    id: string;
    githubPrId: number;
    title: string;
    state: string;
  };
}

interface GitHubIntegrationData {
  repository?: {
    id: string;
    fullName: string;
    owner: string;
    name: string;
    aiReviewEnabled?: boolean;
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
      githubReviewId: string;
      reviewerId?: string;
      reviewerLogin: string;
      state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED';
      body?: string;
      submittedAt?: string;
      reviewer?: {
        name: string;
        avatar?: string;
      };
    }>;
    checks: Array<{
      id: string;
      name: string;
      status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR';
      conclusion?: string;
      detailsUrl?: string;
    }>;
    aiReviews?: AIReviewData[];
  }>;
  versions: Array<{
    id: string;
    version: string;
    releaseType: 'MAJOR' | 'MINOR' | 'PATCH';
    status: 'PENDING' | 'BUILDING' | 'TESTING' | 'READY' | 'RELEASED';
    environment: string;
    branch?: string;
    createdAt: string;
    releasedAt?: string;
    parentVersion?: {
      id: string;
      version: string;
      environment: string;
    };
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
    createdAt: string;
  }>;
  deployments: Array<{
    id: string;
    environment: string;
    status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'PENDING';
    deployedAt?: string;
    githubUrl?: string;
  }>;
}

interface GitHubIssueIntegrationProps {
  issueId: string;
  issueKey: string;
  projectId: string;
  projectSlug: string;
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

  if (loading) {
    return <GitHubSkeleton />;
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
                router.push(`/${currentWorkspace.slug}/projects/${projectSlug}/github`);
              } else {
                console.error('Missing project slug or workspace slug:', { projectSlug, workspaceSlug: currentWorkspace?.slug });
              }
            }}
          >
            <Code className="h-4 w-4 mr-2" />
            GitHub Dashboard
          </Button>
        </CardTitle>
        <CardDescription>
          Track this issue's journey through development, review, and deployment
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <IssueOverview data={data} />
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="space-y-4">
            <IssueReviews data={data} />
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent value="versions" className="space-y-4">
            <IssueVersions data={data} />
          </TabsContent>

          {/* Deployments Tab */}
          <TabsContent value="deployments" className="space-y-4">
            <IssueDeployments data={data} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Overview Tab Component
function IssueOverview({ data }: { data: GitHubIntegrationData }) {
  return (
    <div className="space-y-4">
      {/* Repository Info */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Code className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">{data.repository?.fullName}</div>
            <div className="text-sm text-muted-foreground">
              {data.branch ? `Branch: ${data.branch.name}` : 'No branch linked'}
            </div>
          </div>
        </div>
        {data.repository && (
          <Button variant="outline" size="sm" asChild>
            <a 
              href={`https://github.com/${data.repository.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on GitHub
            </a>
          </Button>
        )}
      </div>

      {/* Issue Journey */}
      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Issue Journey
        </h4>
        
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-4">
            {/* Branch Creation */}
            {data.branch && (
              <div className="relative flex items-start gap-4">
                <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 border-2 border-blue-500">
                  <GitBranch className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Branch Created</span>
                    <Badge variant="outline" className="text-xs">
                      {data.branch.name}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(data.branch.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}

            {/* Pull Requests */}
            {data.pullRequests.map((pr) => (
              <div key={pr.id} className="relative flex items-start gap-4">
                <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  pr.state === 'MERGED' ? 'bg-purple-500 border-purple-500' :
                  pr.state === 'OPEN' ? 'bg-green-500 border-green-500' :
                  'bg-red-500 border-red-500'
                }`}>
                  <GitPullRequest className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Pull Request</span>
                    <Badge variant={getBadgeVariant(pr.state)} className="text-xs">
                      {pr.state.toLowerCase()}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      #{pr.githubPrId}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {pr.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {pr.mergedAt ? 
                      `Merged ${new Date(pr.mergedAt).toLocaleDateString()}` :
                      `Created ${new Date(pr.createdAt).toLocaleDateString()}`
                    }
                  </div>
                </div>
              </div>
            ))}

            {/* Versions */}
            {data.versions.map((version) => (
              <div key={version.id} className="relative flex items-start gap-4">
                <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  version.status === 'RELEASED' ? 'bg-green-500 border-green-500' :
                  version.status === 'PENDING' ? 'bg-yellow-500 border-yellow-500' :
                  'bg-gray-500 border-gray-500'
                }`}>
                  <Tag className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Version {version.version}</span>
                    <Badge variant={getBadgeVariant(version.status)} className="text-xs">
                      {version.status.toLowerCase()}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {version.environment}
                    </Badge>
                  </div>
                  {version.parentVersion && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Promoted from {version.parentVersion.environment} v{version.parentVersion.version}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {version.releasedAt ? 
                      `Released ${new Date(version.releasedAt).toLocaleDateString()}` :
                      `Created ${new Date(version.createdAt).toLocaleDateString()}`
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Reviews Tab Component
function IssueReviews({ data }: { data: GitHubIntegrationData }) {
  const allReviews = data.pullRequests.flatMap(pr =>
    (pr.reviews || []).map(review => ({ ...review, prTitle: pr.title, prNumber: pr.githubPrId }))
  );

  // Flatten AI reviews from all PRs
  const allAIReviews = data.pullRequests.flatMap(pr =>
    (pr.aiReviews || []).map(review => ({
      ...review,
      pullRequest: {
        id: pr.id,
        githubPrId: pr.githubPrId,
        title: pr.title,
        state: pr.state,
      },
    }))
  );

  return (
    <div className="space-y-6">
      {/* AI Reviews Section */}
      <AIReviewsPanel
        reviews={allAIReviews}
        repositoryId={data.repository?.id}
        repositoryFullName={data.repository?.fullName}
        showRequestButton={data.pullRequests.some(pr => pr.state === 'OPEN')}
        isAIReviewEnabled={data.repository?.aiReviewEnabled}
        pullRequestId={data.pullRequests.find(pr => pr.state === 'OPEN')?.id}
        githubPrId={data.pullRequests.find(pr => pr.state === 'OPEN')?.githubPrId}
      />

      {/* Human Reviews Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Human Reviews ({allReviews.length})
          </h4>
        </div>

        {allReviews.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No human reviews yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allReviews.map((review) => (
              <div key={review.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      review.state === 'APPROVED' ? 'bg-green-100 text-green-600' :
                      review.state === 'CHANGES_REQUESTED' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {review.state === 'APPROVED' ? <ThumbsUp className="h-4 w-4" /> :
                       review.state === 'CHANGES_REQUESTED' ? <ThumbsDown className="h-4 w-4" /> :
                       <Eye className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{review.reviewerLogin}</span>
                        <Badge variant={getBadgeVariant(review.state)} className="text-xs">
                          {review.state.toLowerCase().replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        PR #{review.prNumber}: {review.prTitle}
                      </div>
                      {review.body && (
                        <div className="text-sm mt-2 p-2 bg-muted/50 rounded">
                          {review.body}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {review.submittedAt && new Date(review.submittedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Versions Tab Component
function IssueVersions({ data }: { data: GitHubIntegrationData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Versions ({data.versions.length})
        </h4>
      </div>

      {data.versions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No versions created yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.versions.map((version) => (
            <div key={version.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant={getVersionBadgeVariant(version.releaseType)}>
                    v{version.version}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {version.environment}
                  </Badge>
                  {version.branch && (
                    <Badge variant="secondary" className="text-xs">
                      <GitBranch className="h-3 w-3 mr-1" />
                      {version.branch}
                    </Badge>
                  )}
                  <Badge variant={getBadgeVariant(version.status)} className="text-xs">
                    {version.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {version.releasedAt ? 
                    `Released ${new Date(version.releasedAt).toLocaleDateString()}` :
                    `Created ${new Date(version.createdAt).toLocaleDateString()}`
                  }
                </div>
              </div>

              {version.parentVersion && (
                <Alert className="mb-3">
                  <ArrowRight className="h-4 w-4" />
                  <AlertDescription>
                    Promoted from {version.parentVersion.environment} version {version.parentVersion.version}
                  </AlertDescription>
                </Alert>
              )}

              {version.deployments.length > 0 && (
                <div>
                  <h5 className="font-medium text-sm mb-2">Deployments</h5>
                  <div className="space-y-1">
                    {version.deployments.map((deployment) => (
                      <div key={deployment.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {deployment.environment}
                          </Badge>
                          <Badge variant={getBadgeVariant(deployment.status)} className="text-xs">
                            {deployment.status.toLowerCase()}
                          </Badge>
                        </div>
                        {deployment.deployedAt && (
                          <span className="text-muted-foreground text-xs">
                            {new Date(deployment.deployedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Deployments Tab Component
function IssueDeployments({ data }: { data: GitHubIntegrationData }) {
  const allDeployments = [
    ...(data.deployments || []),
    ...(data.versions || []).flatMap(v => (v.deployments || []).map(d => ({ ...d, version: v.version })))
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          Deployments ({allDeployments.length})
        </h4>
      </div>

      {allDeployments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Rocket className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No deployments yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allDeployments.map((deployment) => (
            <div key={deployment.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    deployment.status === 'SUCCESS' ? 'bg-green-500' :
                    deployment.status === 'FAILURE' ? 'bg-red-500' :
                    deployment.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                    'bg-yellow-500'
                  }`} />
                  <span className="font-medium">{deployment.environment}</span>
                  <Badge variant={getBadgeVariant(deployment.status)} className="text-xs">
                    {deployment.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                  {'version' in deployment && deployment.version && (
                    <Badge variant="outline" className="text-xs">
                      v{deployment.version}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {deployment.deployedAt && new Date(deployment.deployedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper functions
function getBadgeVariant(status: string) {
  switch (status.toUpperCase()) {
    case 'SUCCESS':
    case 'RELEASED':
    case 'APPROVED':
    case 'MERGED':
      return 'default';
    case 'FAILURE':
    case 'ERROR':
    case 'CHANGES_REQUESTED':
      return 'destructive';
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'BUILDING':
    case 'OPEN':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getVersionBadgeVariant(releaseType: string) {
  switch (releaseType) {
    case 'MAJOR': return 'destructive';
    case 'MINOR': return 'default';
    case 'PATCH': return 'secondary';
    default: return 'outline';
  }
}
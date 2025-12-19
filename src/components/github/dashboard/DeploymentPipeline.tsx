'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Rocket,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  GitBranch,
  Tag,
  Calendar,
  ExternalLink,
  Loader2,
  RefreshCw,
  History,
  Play,
  RotateCcw,
} from 'lucide-react';

interface Deployment {
  id: string;
  environment: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'ROLLED_BACK';
  deployedAt?: string;
  deployedBy?: string;
  commitSha?: string;
  buildUrl?: string;
  errorMessage?: string;
  version?: {
    id: string;
    version: string;
    tagName?: string;
  };
}

interface EnvironmentStatus {
  environment: string;
  currentVersion?: string;
  lastDeployment?: Deployment;
  history: Deployment[];
}

interface DeploymentPipelineProps {
  repositoryId: string;
}

export function DeploymentPipeline({ repositoryId }: DeploymentPipelineProps) {
  const [environments, setEnvironments] = useState<EnvironmentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);

  useEffect(() => {
    fetchDeployments();
  }, [repositoryId]);

  const fetchDeployments = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/deployments`
      );
      if (response.ok) {
        const data = await response.json();
        setEnvironments(data.environments || []);
      }
    } catch (error) {
      console.error('Error fetching deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'FAILURE':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'IN_PROGRESS':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'PENDING':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'ROLLED_BACK':
        return <RotateCcw className="h-5 w-5 text-orange-500" />;
      case 'CANCELLED':
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'border-green-500/30 bg-green-500/10 text-green-400';
      case 'FAILURE':
        return 'border-red-500/30 bg-red-500/10 text-red-400';
      case 'IN_PROGRESS':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
      case 'PENDING':
        return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400';
      case 'ROLLED_BACK':
        return 'border-orange-500/30 bg-orange-500/10 text-orange-400';
      default:
        return 'border-gray-500/30 bg-gray-500/10 text-gray-400';
    }
  };

  const getEnvColor = (env: string) => {
    switch (env.toLowerCase()) {
      case 'production':
        return 'bg-green-500';
      case 'staging':
        return 'bg-yellow-500';
      case 'development':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const orderedEnvs = ['development', 'staging', 'production'];
  const sortedEnvironments = [...environments].sort(
    (a, b) => orderedEnvs.indexOf(a.environment.toLowerCase()) - orderedEnvs.indexOf(b.environment.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Pipeline Visualization */}
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-lg text-[#e6edf3]">Deployment Pipeline</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDeployments}
              className="border-[#30363d] bg-transparent hover:bg-[#21262d]"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
          <CardDescription>
            Track deployments across all environments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedEnvironments.length === 0 ? (
            <div className="text-center py-12">
              <Rocket className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium text-[#e6edf3] mb-2">No Deployments Yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Deployments will appear here when you release new versions.
                Create a release on GitHub to trigger deployments.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pipeline Flow */}
              <div className="flex items-center justify-between">
                {sortedEnvironments.map((env, index) => (
                  <div key={env.environment} className="flex items-center flex-1">
                    <div
                      className={`flex-1 p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedEnv === env.environment
                          ? 'border-[#58a6ff] ring-1 ring-[#58a6ff]'
                          : 'border-[#21262d] hover:border-[#30363d]'
                      } bg-[#161b22]`}
                      onClick={() =>
                        setSelectedEnv(selectedEnv === env.environment ? null : env.environment)
                      }
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getEnvColor(env.environment)}`} />
                          <span className="font-medium text-[#e6edf3] capitalize">
                            {env.environment}
                          </span>
                        </div>
                        {env.lastDeployment && getStatusIcon(env.lastDeployment.status)}
                      </div>

                      {env.currentVersion ? (
                        <div>
                          <Badge variant="outline" className="mb-2">
                            v{env.currentVersion}
                          </Badge>
                          <p className="text-xs text-[#8b949e]">
                            {formatDate(env.lastDeployment?.deployedAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-[#8b949e]">Not deployed</p>
                      )}
                    </div>

                    {index < sortedEnvironments.length - 1 && (
                      <ArrowRight className="h-5 w-5 text-[#30363d] mx-2 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {/* Selected Environment Details */}
              {selectedEnv && (
                <Card className="bg-[#161b22] border-[#21262d]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-[#e6edf3] capitalize">
                        {selectedEnv} Deployment History
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEnv(null)}
                        className="h-8"
                      >
                        Close
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const envData = environments.find(e => e.environment === selectedEnv);
                      if (!envData?.history || envData.history.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No deployment history available
                          </p>
                        );
                      }
                      return (
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-3">
                            {envData.history.map((deployment, idx) => (
                              <div
                                key={deployment.id}
                                className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#21262d]"
                              >
                                <div className="flex-shrink-0 mt-1">
                                  {getStatusIcon(deployment.status)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {deployment.version && (
                                      <Badge variant="outline" className="text-xs">
                                        v{deployment.version.version}
                                      </Badge>
                                    )}
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${getStatusColor(deployment.status)}`}
                                    >
                                      {deployment.status.toLowerCase().replace('_', ' ')}
                                    </Badge>
                                    {idx === 0 && deployment.status === 'SUCCESS' && (
                                      <Badge className="text-xs bg-green-500/20 text-green-400 border-0">
                                        Current
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-[#8b949e]">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {formatDate(deployment.deployedAt)}
                                    </span>
                                    {deployment.commitSha && (
                                      <span className="flex items-center gap-1 font-mono">
                                        <GitBranch className="h-3 w-3" />
                                        {deployment.commitSha.substring(0, 7)}
                                      </span>
                                    )}
                                    {deployment.deployedBy && (
                                      <span>by {deployment.deployedBy}</span>
                                    )}
                                  </div>
                                  {deployment.errorMessage && (
                                    <p className="text-xs text-red-400 mt-2">
                                      {deployment.errorMessage}
                                    </p>
                                  )}
                                </div>
                                {deployment.buildUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    asChild
                                  >
                                    <a
                                      href={deployment.buildUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

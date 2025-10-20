'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  GitBranch, 
  ArrowRight, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Rocket,
  GitCommit
} from 'lucide-react';

interface Version {
  id: string;
  version: string;
  releaseType: 'MAJOR' | 'MINOR' | 'PATCH' | 'PRERELEASE';
  status: 'PENDING' | 'BUILDING' | 'TESTING' | 'READY' | 'RELEASED' | 'FAILED' | 'CANCELLED';
  environment: string;
  branch?: string;
  releasedAt?: string;
  createdAt: string;
  isProduction: boolean;
  parentVersion?: {
    id: string;
    version: string;
    environment: string;
  };
  issues: Array<{
    id: string;
    issue: {
      type: string;
    };
  }>;
  deployments: Array<{
    id: string;
    environment: string;
    status: string;
  }>;
}

interface VersionTimelineProps {
  versions: Version[];
  showMetrics?: boolean;
}

export function VersionTimeline({ versions, showMetrics = false }: VersionTimelineProps) {
  // Sort versions by creation date
  const sortedVersions = [...versions].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Group versions by environment for better visualization
  const productionVersions = sortedVersions.filter(v => v.environment === 'production');
  const developmentVersions = sortedVersions.filter(v => v.environment === 'development');

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Version Timeline</CardTitle>
          {showMetrics && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                Production ({productionVersions.length})
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                Development ({developmentVersions.length})
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">

          {/* Timeline */}
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
            
            <div className="space-y-6">
              {sortedVersions.slice(0, 10).map((version, index) => (
                <div key={version.id} className="relative flex items-start gap-4">
                  {/* Timeline dot */}
                  <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    version.environment === 'production' 
                      ? 'bg-green-500 border-green-500' 
                      : 'bg-blue-500 border-blue-500'
                  }`}>
                    {version.environment === 'production' ? (
                      <Rocket className="h-4 w-4 text-white" />
                    ) : (
                      <GitCommit className="h-4 w-4 text-white" />
                    )}
                  </div>

                  {/* Version info */}
                  <div className="flex-1 min-w-0 pb-6">
                    <div className="flex items-center justify-between">
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
                        <Badge variant={getStatusBadgeVariant(version.status)} className="text-xs">
                          {getStatusIcon(version.status)}
                          {version.status.toLowerCase()}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(version.releasedAt || version.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Version details */}
                    <div className="mt-2 text-sm">
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span>
                          {version.issues.filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type)).length} features
                        </span>
                        <span>
                          {version.issues.filter(vi => vi.issue.type === 'BUG').length} fixes
                        </span>
                        <span>
                          {version.deployments.length} deployments
                        </span>
                      </div>
                    </div>

                    {/* Version inheritance */}
                    {version.parentVersion && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        <span>Promoted from {version.parentVersion.environment} v{version.parentVersion.version}</span>
                      </div>
                    )}

                    {/* Deployment status */}
                    {version.deployments.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        {version.deployments.slice(0, 3).map((deployment) => (
                          <div key={deployment.id} className="flex items-center gap-1 text-xs">
                            <span className={`w-2 h-2 rounded-full ${
                              deployment.status === 'SUCCESS' ? 'bg-green-500' : 
                              deployment.status === 'FAILURE' ? 'bg-red-500' : 'bg-yellow-500'
                            }`} />
                            <span className="text-muted-foreground">{deployment.environment}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Show more indicator */}
            {sortedVersions.length > 10 && (
              <div className="relative flex items-center justify-center pt-4">
                <div className="absolute left-4 w-0.5 h-4 bg-border" />
                <div className="bg-background px-3 py-1 text-xs text-muted-foreground border rounded-full">
                  +{sortedVersions.length - 10} more versions
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function getVersionBadgeVariant(releaseType: string) {
  switch (releaseType) {
    case 'MAJOR': return 'destructive';
    case 'MINOR': return 'default';
    case 'PATCH': return 'secondary';
    default: return 'outline';
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'RELEASED': return 'default';
    case 'READY': return 'secondary';
    case 'PENDING': return 'outline';
    case 'BUILDING': return 'outline';
    case 'FAILED': return 'destructive';
    default: return 'outline';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'RELEASED':
      return <CheckCircle className="h-3 w-3 mr-1" />;
    case 'FAILED':
      return <AlertCircle className="h-3 w-3 mr-1" />;
    case 'PENDING':
    case 'BUILDING':
      return <Clock className="h-3 w-3 mr-1" />;
    default:
      return null;
  }
}

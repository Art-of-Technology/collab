'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  Clock, 
  GitBranch, 
  Tag, 
  Search,
  Download,
  Sparkles,
  Bug,
  TrendingUp,
  ArrowRight,
  GitCommit,
  Rocket,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { VersionTimeline } from './VersionTimeline';

interface Version {
  id: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  releaseType: 'MAJOR' | 'MINOR' | 'PATCH' | 'PRERELEASE';
  status: 'PENDING' | 'BUILDING' | 'TESTING' | 'READY' | 'RELEASED' | 'FAILED' | 'CANCELLED';
  environment: string;
  branch?: string;
  releasedAt?: string;
  createdAt: string;
  aiSummary?: string;
  aiChangelog?: string;
  
  // Version inheritance
  parentVersionId?: string;
  isProduction: boolean;
  parentVersion?: {
    id: string;
    version: string;
    environment: string;
  };
  childVersions?: Array<{
    id: string;
    version: string;
    environment: string;
  }>;
  
  issues: Array<{
    id: string;
    issueKey: string;
    aiTitle?: string;
    aiSummary?: string;
    issue: {
      title: string;
      type: string;
      priority: string;
    };
  }>;
  
  releases: Array<{
    id: string;
    name: string;
    githubUrl?: string;
    publishedAt?: string;
  }>;
  
  deployments: Array<{
    id: string;
    environment: string;
    status: string;
    deployedAt?: string;
  }>;
}

interface ChangelogPageProps {
  repositoryId: string;
  projectName: string;
}

export function ChangelogPage({ repositoryId, projectName }: ChangelogPageProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [filteredVersions, setFilteredVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  useEffect(() => {
    fetchVersions();
  }, [repositoryId]);

  useEffect(() => {
    filterVersions();
  }, [versions, searchTerm, environmentFilter, statusFilter]);

  const fetchVersions = async () => {
    try {
      const response = await fetch(`/api/github/repositories/${repositoryId}/versions`);
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast.error('Failed to load versions');
    } finally {
      setLoading(false);
    }
  };

  const filterVersions = () => {
    let filtered = versions;

    if (searchTerm) {
      filtered = filtered.filter(version =>
        version.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
        version.aiSummary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        version.issues.some(vi => 
          vi.issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vi.aiTitle?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    if (environmentFilter !== 'all') {
      filtered = filtered.filter(version => version.environment === environmentFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(version => version.status === statusFilter);
    }

    setFilteredVersions(filtered);
  };

  const exportChangelog = () => {
    const changelogContent = filteredVersions.map(version => {
      const features = version.issues.filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type));
      const bugfixes = version.issues.filter(vi => vi.issue.type === 'BUG');
      
      return `
# Version ${version.version} - ${new Date(version.releasedAt || version.createdAt).toLocaleDateString()}

${version.aiSummary || `This release includes ${version.issues.length} changes.`}

## 🎉 New Features & Enhancements (${features.length})
${features.map(vi => `- ${vi.aiTitle || vi.issue.title}`).join('\n')}

## 🐛 Bug Fixes (${bugfixes.length})
${bugfixes.map(vi => `- ${vi.aiTitle || vi.issue.title}`).join('\n')}

---
      `.trim();
    }).join('\n\n');
    
    const blob = new Blob([changelogContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}-changelog.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Changelog exported successfully');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading changelog...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Release History</h1>
          <p className="text-muted-foreground">
            Track your project's evolution with AI-enhanced release notes and version insights
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportChangelog}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Combined Developer & Project Manager View */}
      <CombinedReleaseView 
        versions={filteredVersions}
        allVersions={versions}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        environmentFilter={environmentFilter}
        setEnvironmentFilter={setEnvironmentFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
    </div>
  );
}

// Combined Release View Component
function CombinedReleaseView({ 
  versions, 
  allVersions,
  searchTerm, 
  setSearchTerm, 
  environmentFilter, 
  setEnvironmentFilter, 
  statusFilter, 
  setStatusFilter
}: {
  versions: Version[];
  allVersions: Version[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  environmentFilter: string;
  setEnvironmentFilter: (filter: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
}) {
  const productionVersions = allVersions.filter(v => v.environment === 'production');
  const developmentVersions = allVersions.filter(v => v.environment === 'development');
  
  return (
    <div className="space-y-6">
      {/* Quick Stats & Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Stats Cards */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Target className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-lg font-semibold">{productionVersions.length}</div>
                <div className="text-xs text-muted-foreground">Production</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-1">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <GitCommit className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-lg font-semibold">{developmentVersions.length}</div>
                <div className="text-xs text-muted-foreground">Development</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-1">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {allVersions.reduce((acc, v) => acc + v.issues.length, 0)}
                </div>
                <div className="text-xs text-muted-foreground">Issues Resolved</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-1">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {developmentVersions.filter(v => v.status === 'PENDING').length}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search versions, features, or fixes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Environments</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="RELEASED">Released</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="BUILDING">Building</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Version Timeline */}
      <VersionTimeline versions={allVersions} showMetrics />

      {/* Version List with Inheritance */}
      <div className="space-y-4">
        {versions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No versions found</h3>
                <p>No versions match your current filters. Try adjusting your search criteria.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          versions.map((version) => (
            <Card key={version.id} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={getVersionBadgeVariant(version.releaseType)} className="text-sm font-medium">
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
                      {version.status.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(version.releasedAt || version.createdAt).toLocaleDateString()}
                  </div>
                </div>
                
                {version.aiSummary && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {version.aiSummary}
                  </p>
                )}

                {version.parentVersion && (
                  <Alert className="mt-3">
                    <ArrowRight className="h-4 w-4" />
                    <AlertDescription>
                      Promoted from {version.parentVersion.environment} version {version.parentVersion.version}
                    </AlertDescription>
                  </Alert>
                )}
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Issue Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500" />
                      Features ({version.issues.filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type)).length})
                    </h4>
                    <div className="space-y-1">
                      {version.issues
                        .filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type))
                        .slice(0, 3)
                        .map((vi) => (
                          <div key={vi.id} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>{vi.aiTitle || vi.issue.title}</span>
                          </div>
                        ))}
                      {version.issues.filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type)).length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{version.issues.filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type)).length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Bug className="h-4 w-4 text-red-500" />
                      Bug Fixes ({version.issues.filter(vi => vi.issue.type === 'BUG').length})
                    </h4>
                    <div className="space-y-1">
                      {version.issues
                        .filter(vi => vi.issue.type === 'BUG')
                        .slice(0, 3)
                        .map((vi) => (
                          <div key={vi.id} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="text-red-500 mt-1">•</span>
                            <span>{vi.aiTitle || vi.issue.title}</span>
                          </div>
                        ))}
                      {version.issues.filter(vi => vi.issue.type === 'BUG').length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{version.issues.filter(vi => vi.issue.type === 'BUG').length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-green-500" />
                      Deployments ({version.deployments.length})
                    </h4>
                    <div className="space-y-1">
                      {version.deployments.slice(0, 3).map((deployment) => (
                        <div key={deployment.id} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${
                            deployment.status === 'SUCCESS' ? 'bg-green-500' : 
                            deployment.status === 'FAILURE' ? 'bg-red-500' : 
                            deployment.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-yellow-500'
                          }`} />
                          <Badge variant="outline" className="text-xs">
                            {deployment.environment}
                          </Badge>
                          <span className="text-muted-foreground">
                            {deployment.status.toLowerCase().replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                      {version.deployments.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{version.deployments.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Child Versions (if this is a development version) */}
                {version.childVersions && version.childVersions.length > 0 && (
                  <div className="border-t pt-3">
                    <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      Promoted To
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {version.childVersions.map((child) => (
                        <Badge key={child.id} variant="outline" className="text-xs">
                          {child.environment} v{child.version}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
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
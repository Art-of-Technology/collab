'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  Clock, 
  GitBranch, 
  Tag, 
  ExternalLink, 
  Search,
  Filter,
  Download,
  Sparkles,
  Bug,
  Zap,
  Plus,
  AlertTriangle,
  Shield,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

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
  releasedAt?: string;
  createdAt: string;
  aiSummary?: string;
  aiChangelog?: string;
  
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
      if (!response.ok) throw new Error('Failed to fetch versions');
      
      const data = await response.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast.error('Failed to load changelog');
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
          vi.aiTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vi.issue.title.toLowerCase().includes(searchTerm.toLowerCase())
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

  const getVersionIcon = (releaseType: string) => {
    switch (releaseType) {
      case 'MAJOR': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'MINOR': return <Plus className="h-4 w-4 text-blue-500" />;
      case 'PATCH': return <Bug className="h-4 w-4 text-green-500" />;
      default: return <Tag className="h-4 w-4 text-gray-500" />;
    }
  };

  const getIssueTypeIcon = (type: string) => {
    switch (type) {
      case 'BUG': return <Bug className="h-3 w-3 text-red-500" />;
      case 'TASK': return <Plus className="h-3 w-3 text-blue-500" />;
      case 'STORY': return <Plus className="h-3 w-3 text-purple-500" />;
      case 'EPIC': return <Zap className="h-3 w-3 text-orange-500" />;
      default: return <Plus className="h-3 w-3 text-gray-500" />;
    }
  };

  const categorizeIssues = (issues: Version['issues']) => {
    return {
      features: issues.filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type)),
      bugfixes: issues.filter(vi => vi.issue.type === 'BUG'),
      improvements: issues.filter(vi => ['MILESTONE', 'SUBTASK'].includes(vi.issue.type)),
    };
  };

  const exportChangelog = () => {
    const changelogContent = filteredVersions.map(version => {
      const categorized = categorizeIssues(version.issues);
      return `
# Version ${version.version} - ${new Date(version.releasedAt || version.createdAt).toLocaleDateString()}

${version.aiSummary || `This release includes ${version.issues.length} changes.`}

## 🎉 New Features & Enhancements (${categorized.features.length})
${categorized.features.map(vi => `- ${vi.aiTitle || vi.issue.title}`).join('\n')}

## 🐛 Bug Fixes (${categorized.bugfixes.length})
${categorized.bugfixes.map(vi => `- ${vi.aiTitle || vi.issue.title}`).join('\n')}

## ⚡ Improvements (${categorized.improvements.length})
${categorized.improvements.map(vi => `- ${vi.aiTitle || vi.issue.title}`).join('\n')}

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
          <h1 className="text-3xl font-bold">Changelog</h1>
          <p className="text-muted-foreground">
            AI-enhanced release notes and version history for {projectName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportChangelog}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
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
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Environments</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="development">Development</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="RELEASED">Released</SelectItem>
                <SelectItem value="READY">Ready</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="BUILDING">Building</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Versions List */}
      <div className="space-y-6">
        {filteredVersions.length === 0 ? (
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
          filteredVersions.map((version, index) => {
            const categorized = categorizeIssues(version.issues);
            const isLatest = index === 0;
            
            return (
              <Card key={version.id} className={isLatest ? 'border-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getVersionIcon(version.releaseType)}
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <code className="text-xl">v{version.version}</code>
                          {isLatest && <Badge variant="default">Latest</Badge>}
                          {version.prerelease && <Badge variant="secondary">Pre-release</Badge>}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(version.releasedAt || version.createdAt).toLocaleDateString()}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {version.environment}
                          </Badge>
                          <Badge 
                            variant={version.status === 'RELEASED' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {version.status.toLowerCase()}
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {version.releases.map(release => (
                        <Button key={release.id} variant="outline" size="sm" asChild>
                          <a 
                            href={release.githubUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            GitHub
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* AI Summary */}
                  {version.aiSummary && (
                    <div className="bg-muted/50 rounded-lg p-4 border border-dashed">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">AI Summary</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{version.aiSummary}</p>
                    </div>
                  )}

                  {/* Changes by Category */}
                  <Tabs defaultValue="features" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="features" className="flex items-center gap-2">
                        <Plus className="h-3 w-3" />
                        Features ({categorized.features.length})
                      </TabsTrigger>
                      <TabsTrigger value="bugfixes" className="flex items-center gap-2">  
                        <Bug className="h-3 w-3" />
                        Fixes ({categorized.bugfixes.length})
                      </TabsTrigger>
                      <TabsTrigger value="improvements" className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3" />
                        Improvements ({categorized.improvements.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="features" className="space-y-3">
                      {categorized.features.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No new features in this release.</p>
                      ) : (
                        categorized.features.map((versionIssue) => (
                          <div key={versionIssue.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                            {getIssueTypeIcon(versionIssue.issue.type)}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm">
                                {versionIssue.aiTitle || versionIssue.issue.title}
                              </h4>
                              {versionIssue.aiSummary && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {versionIssue.aiSummary}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <code className="text-xs bg-background px-2 py-1 rounded">
                                  {versionIssue.issueKey}
                                </code>
                                <Badge variant="outline" className="text-xs">
                                  {versionIssue.issue.type.toLowerCase()}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="bugfixes" className="space-y-3">
                      {categorized.bugfixes.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No bug fixes in this release.</p>  
                      ) : (
                        categorized.bugfixes.map((versionIssue) => (
                          <div key={versionIssue.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                            {getIssueTypeIcon(versionIssue.issue.type)}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm">
                                {versionIssue.aiTitle || versionIssue.issue.title}
                              </h4>
                              {versionIssue.aiSummary && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {versionIssue.aiSummary}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <code className="text-xs bg-background px-2 py-1 rounded">
                                  {versionIssue.issueKey}
                                </code>
                                <Badge variant="outline" className="text-xs">
                                  {versionIssue.issue.priority}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="improvements" className="space-y-3">
                      {categorized.improvements.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No improvements in this release.</p>
                      ) : (
                        categorized.improvements.map((versionIssue) => (
                          <div key={versionIssue.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                            {getIssueTypeIcon(versionIssue.issue.type)}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm">
                                {versionIssue.aiTitle || versionIssue.issue.title}
                              </h4>
                              {versionIssue.aiSummary && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {versionIssue.aiSummary}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <code className="text-xs bg-background px-2 py-1 rounded">
                                  {versionIssue.issueKey}
                                </code>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>
                  </Tabs>

                  {/* Deployment Status */}
                  {version.deployments.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Deployments
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {version.deployments.map((deployment) => (
                          <div key={deployment.id} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div>
                              <div className="font-medium text-sm capitalize">{deployment.environment}</div>
                              <div className="text-xs text-muted-foreground">
                                {deployment.deployedAt 
                                  ? new Date(deployment.deployedAt).toLocaleDateString()
                                  : 'Not deployed'
                                }
                              </div>
                            </div>
                            <Badge 
                              variant={deployment.status === 'SUCCESS' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {deployment.status.toLowerCase()}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

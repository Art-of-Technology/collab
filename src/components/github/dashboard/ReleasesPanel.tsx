'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; 
import {
  Tag,
  ExternalLink,
  Calendar,
  Download,
  ChevronRight,
  GitBranch,
  Sparkles,
  Loader2,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';

interface Release {
  id: string;
  tagName: string;
  name: string;
  description?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  publishedAt?: string;
  githubUrl?: string;
  downloadCount: number;
  version?: {
    id: string;
    version: string;
    status: string;
    environment: string;
    aiSummary?: string;
    issues: Array<{
      id: string;
      issue: {
        issueKey: string;
        title: string;
        type: string;
      };
    }>;
  };
}

interface ReleasesPanelProps {
  repositoryId: string;
  compact?: boolean;
  limit?: number;
  showActions?: boolean;
}

export function ReleasesPanel({
  repositoryId,
  compact = false,
  limit = 10,
  showActions = false,
}: ReleasesPanelProps) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null);

  useEffect(() => {
    fetchReleases();
  }, [repositoryId]);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/releases?limit=${limit}`
      );
      if (response.ok) {
        const data = await response.json();
        setReleases(data.releases || []);
      }
    } catch (error) {
      console.error('Error fetching releases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncReleases = async () => {
    try {
      setSyncing(true);
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/sync-releases`,
        { method: 'POST' }
      );
      if (response.ok) {
        toast.success('Releases synced from GitHub');
        await fetchReleases();
      } else {
        toast.error('Failed to sync releases');
      }
    } catch (error) {
      toast.error('Failed to sync releases');
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateChangelog = async (releaseId: string) => {
    try {
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/releases/${releaseId}/generate-changelog`,
        { method: 'POST' }
      );
      if (response.ok) {
        toast.success('Changelog generated successfully');
        await fetchReleases();
      }
    } catch (error) {
      toast.error('Failed to generate changelog');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Not published';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'RELEASED':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'READY':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'PENDING':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'FAILED':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0d1117] border-[#21262d]">
      <CardHeader className={compact ? 'pb-2' : ''}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-green-500" />
            <CardTitle className="text-lg text-[#e6edf3]">Releases</CardTitle>
            <Badge variant="secondary" className="ml-2">
              {releases.length}
            </Badge>
          </div>
          {showActions && (
            <Button
              onClick={handleSyncReleases}
              variant="outline"
              size="sm"
              disabled={syncing}
              className="border-[#30363d] bg-transparent hover:bg-[#21262d]"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Sync from GitHub
            </Button>
          )}
        </div>
        {!compact && (
          <CardDescription>
            Track GitHub releases and generate AI-powered changelogs
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {releases.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No releases found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create releases on GitHub or sync existing ones
            </p>
            {showActions && (
              <Button
                onClick={handleSyncReleases}
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Sync Releases
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea className={compact ? 'h-[300px]' : 'h-[500px]'}>
            <div className="space-y-4">
              {releases.map((release, index) => (
                <div key={release.id}>
                  <div
                    className={`p-4 rounded-lg bg-[#161b22] border border-[#21262d] transition-all ${
                      expandedRelease === release.id ? 'ring-1 ring-[#58a6ff]' : ''
                    }`}
                  >
                    {/* Release Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                          <Tag className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#e6edf3]">
                              {release.tagName}
                            </span>
                            {release.isDraft && (
                              <Badge variant="outline" className="text-xs">
                                Draft
                              </Badge>
                            )}
                            {release.isPrerelease && (
                              <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
                                Pre-release
                              </Badge>
                            )}
                            {release.version && (
                              <Badge variant="outline" className={getStatusColor(release.version.status)}>
                                {release.version.status.toLowerCase()}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-[#8b949e] mt-1">{release.name}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-[#8b949e]">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(release.publishedAt)}
                            </span>
                            {release.version?.environment && (
                              <span className="flex items-center gap-1">
                                <GitBranch className="h-3 w-3" />
                                {release.version.environment}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {release.githubUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            asChild
                          >
                            <a
                              href={release.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            setExpandedRelease(
                              expandedRelease === release.id ? null : release.id
                            )
                          }
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${
                              expandedRelease === release.id ? 'rotate-90' : ''
                            }`}
                          />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {expandedRelease === release.id && (
                      <div className="mt-4 pt-4 border-t border-[#21262d]">
                        {/* AI Summary */}
                        {release.version?.aiSummary && (
                          <div className="mb-4 p-3 rounded-lg bg-[#0d1117] border border-[#21262d]">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="h-4 w-4 text-purple-400" />
                              <span className="text-xs font-medium text-purple-400">
                                AI Summary
                              </span>
                            </div>
                            <p className="text-sm text-[#8b949e]">
                              {release.version.aiSummary}
                            </p>
                          </div>
                        )}

                        {/* Release Description */}
                        {release.description && (
                          <div className="mb-4">
                            <h4 className="text-xs font-medium text-[#8b949e] mb-2">
                              Release Notes
                            </h4>
                            <div className="prose prose-sm prose-invert max-w-none text-[#8b949e]">
                              <p className="whitespace-pre-wrap">{release.description}</p>
                            </div>
                          </div>
                        )}

                        {/* Related Issues */}
                        {release.version?.issues && release.version.issues.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-medium text-[#8b949e] mb-2">
                              Included Changes ({release.version.issues.length})
                            </h4>
                            <div className="space-y-2">
                              {release.version.issues.slice(0, 5).map((vi) => (
                                <div
                                  key={vi.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {vi.issue.issueKey}
                                  </Badge>
                                  <span className="text-[#8b949e] truncate">
                                    {vi.issue.title}
                                  </span>
                                </div>
                              ))}
                              {release.version.issues.length > 5 && (
                                <p className="text-xs text-[#8b949e]">
                                  +{release.version.issues.length - 5} more changes
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {showActions && (
                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateChangelog(release.id)}
                              className="border-[#30363d]"
                            >
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate AI Changelog
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {index < releases.length - 1 && !compact && (
                    <div className="flex items-center justify-center my-2">
                      <div className="w-px h-4 bg-[#21262d]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

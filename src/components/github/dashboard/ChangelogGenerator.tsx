'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sparkles,
  Download,
  Copy,
  Loader2,
  Tag,
  GitCommit,
  GitPullRequest,
  FileText,
  Check,
  Wand2,
  Eye,
  Edit,
} from 'lucide-react';
import { toast } from 'sonner';

// HTML escape function to prevent XSS when rendering changelog content
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

interface Release {
  id: string;
  tagName: string;
  name: string;
  description?: string;
  publishedAt?: string;
}

interface ChangelogGeneratorProps {
  repositoryId: string;
  projectName: string;
}

export function ChangelogGenerator({ repositoryId, projectName }: ChangelogGeneratorProps) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [changelog, setChangelog] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Options
  const [includeCommits, setIncludeCommits] = useState(true);
  const [includePRs, setIncludePRs] = useState(true);
  const [includeReleaseNotes, setIncludeReleaseNotes] = useState(true);
  const [format, setFormat] = useState('markdown');

  useEffect(() => {
    fetchReleases();
  }, [repositoryId]);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/releases?limit=20`
      );
      if (response.ok) {
        const data = await response.json();
        setReleases(data.releases || []);
        if (data.releases?.length > 0) {
          setSelectedRelease(data.releases[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching releases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedRelease) {
      toast.error('Please select a release');
      return;
    }

    try {
      setGenerating(true);
      const response = await fetch(
        `/api/github/repositories/${repositoryId}/generate-changelog`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            releaseId: selectedRelease,
            options: {
              includeCommits,
              includePRs,
              includeReleaseNotes,
              format,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setChangelog(data.changelog);
        toast.success('Changelog generated successfully');
      } else {
        toast.error('Failed to generate changelog');
      }
    } catch (error) {
      toast.error('Failed to generate changelog');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(changelog);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const blob = new Blob([changelog], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const selectedReleaseData = releases.find(r => r.id === selectedRelease);
    a.download = `${projectName}-${selectedReleaseData?.tagName || 'changelog'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Changelog exported');
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Configuration Panel */}
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-lg text-[#e6edf3]">AI Changelog Generator</CardTitle>
          </div>
          <CardDescription>
            Generate beautiful changelogs from your GitHub releases, commits, and PRs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Release Selection */}
          <div className="space-y-2">
            <Label className="text-[#e6edf3]">Select Release</Label>
            <Select value={selectedRelease} onValueChange={setSelectedRelease}>
              <SelectTrigger className="bg-[#161b22] border-[#30363d]">
                <SelectValue placeholder="Select a release" />
              </SelectTrigger>
              <SelectContent className="bg-[#161b22] border-[#30363d]">
                {releases.map((release) => (
                  <SelectItem key={release.id} value={release.id}>
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <span>{release.tagName}</span>
                      <span className="text-xs text-[#8b949e]">
                        {formatDate(release.publishedAt)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Include Options */}
          <div className="space-y-3">
            <Label className="text-[#e6edf3]">Include in Changelog</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="commits"
                  checked={includeCommits}
                  onCheckedChange={(checked) => setIncludeCommits(checked as boolean)}
                />
                <label
                  htmlFor="commits"
                  className="text-sm text-[#8b949e] flex items-center gap-2 cursor-pointer"
                >
                  <GitCommit className="h-4 w-4" />
                  Commit messages
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="prs"
                  checked={includePRs}
                  onCheckedChange={(checked) => setIncludePRs(checked as boolean)}
                />
                <label
                  htmlFor="prs"
                  className="text-sm text-[#8b949e] flex items-center gap-2 cursor-pointer"
                >
                  <GitPullRequest className="h-4 w-4" />
                  Pull request descriptions
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="releaseNotes"
                  checked={includeReleaseNotes}
                  onCheckedChange={(checked) => setIncludeReleaseNotes(checked as boolean)}
                />
                <label
                  htmlFor="releaseNotes"
                  className="text-sm text-[#8b949e] flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  GitHub release notes
                </label>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <Label className="text-[#e6edf3]">Output Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="bg-[#161b22] border-[#30363d]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#161b22] border-[#30363d]">
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="plain">Plain Text</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedRelease}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            {generating ? 'Generating...' : 'Generate Changelog'}
          </Button>

          {/* Info */}
          <div className="text-xs text-[#8b949e] p-3 bg-[#161b22] rounded-lg border border-[#21262d]">
            <p className="font-medium text-[#e6edf3] mb-1">How it works</p>
            <p>
              AI analyzes your selected data sources (commits, PRs, release notes)
              and generates a well-structured, user-friendly changelog that highlights
              key features, bug fixes, and improvements.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="bg-[#0d1117] border-[#21262d]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg text-[#e6edf3]">Preview</CardTitle>
            </div>
            {changelog && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditMode(!editMode)}
                  className="h-8"
                >
                  {editMode ? (
                    <Eye className="h-4 w-4 mr-1" />
                  ) : (
                    <Edit className="h-4 w-4 mr-1" />
                  )}
                  {editMode ? 'Preview' : 'Edit'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExport}
                  className="h-8"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {changelog ? (
            editMode ? (
              <Textarea
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                className="min-h-[500px] font-mono text-sm bg-[#161b22] border-[#30363d] text-[#e6edf3]"
              />
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="prose prose-invert prose-sm max-w-none">
                  <div
                    className="text-[#e6edf3] whitespace-pre-wrap font-mono text-sm p-4 bg-[#161b22] rounded-lg border border-[#21262d]"
                    dangerouslySetInnerHTML={{
                      __html: escapeHtml(changelog)
                        .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-[#e6edf3] mb-4">$1</h1>')
                        .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-[#e6edf3] mt-6 mb-3">$1</h2>')
                        .replace(/^### (.+)$/gm, '<h3 class="text-base font-medium text-[#e6edf3] mt-4 mb-2">$1</h3>')
                        .replace(/^- (.+)$/gm, '<li class="text-[#8b949e] ml-4">$1</li>')
                        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#e6edf3]">$1</strong>')
                        .replace(/`(.+?)`/g, '<code class="bg-[#21262d] px-1 rounded text-[#58a6ff]">$1</code>')
                        .replace(/\n/g, '<br/>')
                    }}
                  />
                </div>
              </ScrollArea>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-[500px] text-center">
              <Sparkles className="h-16 w-16 mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium text-[#e6edf3] mb-2">No Changelog Generated</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Select a release and configure your options, then click "Generate Changelog"
                to create an AI-powered changelog from your GitHub data.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

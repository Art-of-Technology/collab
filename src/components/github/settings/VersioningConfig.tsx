'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tag,
  GitBranch,
  Save,
  Loader2,
  Info,
  Package,
  GitMerge,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VersioningConfigProps {
  repositoryId: string;
  currentConfig: {
    versioningStrategy: 'SEMANTIC' | 'CALVER' | 'CUSTOM';
    autoVersioning: boolean;
    versionPrefix: string;
    releaseBranch: string;
    autoGenerateChangelog: boolean;
    includeCommitsInChangelog: boolean;
    includePRsInChangelog: boolean;
  };
  branches: string[];
}

const VERSION_STRATEGIES = [
  {
    id: 'SEMANTIC',
    name: 'Semantic Versioning',
    description: 'MAJOR.MINOR.PATCH (e.g., 1.2.3)',
    example: '1.0.0 → 1.0.1 → 1.1.0 → 2.0.0',
    icon: Package,
  },
  {
    id: 'CALVER',
    name: 'Calendar Versioning',
    description: 'YYYY.MM.PATCH (e.g., 2024.01.1)',
    example: '2024.01.1 → 2024.01.2 → 2024.02.1',
    icon: Tag,
  },
  {
    id: 'CUSTOM',
    name: 'Custom Pattern',
    description: 'Use your own versioning pattern',
    example: 'Define your own format',
    icon: Sparkles,
  },
];

export function VersioningConfig({
  repositoryId,
  currentConfig,
  branches,
}: VersioningConfigProps) {
  const [config, setConfig] = useState(currentConfig);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/github/repositories/${repositoryId}/configuration`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        toast.success('Versioning configuration saved');
      } else {
        toast.error('Failed to save configuration');
      }
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(currentConfig);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Version Strategy */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f]">
          <h3 className="text-sm font-medium text-[#e6edf3] flex items-center gap-2">
            <Tag className="h-4 w-4 text-[#6e7681]" />
            Version Strategy
          </h3>
          <p className="text-xs text-[#6e7681] mt-0.5">
            Choose how versions are numbered and incremented
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {VERSION_STRATEGIES.map(strategy => (
              <button
                key={strategy.id}
                onClick={() => setConfig(prev => ({ ...prev, versioningStrategy: strategy.id as typeof prev.versioningStrategy }))}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all",
                  config.versioningStrategy === strategy.id
                    ? "border-[#58a6ff] bg-[#58a6ff]/5"
                    : "border-[#1f1f1f] bg-[#161617] hover:border-[#30363d]"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <strategy.icon className={cn(
                    "h-4 w-4",
                    config.versioningStrategy === strategy.id ? "text-[#58a6ff]" : "text-[#6e7681]"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    config.versioningStrategy === strategy.id ? "text-[#58a6ff]" : "text-[#e6edf3]"
                  )}>
                    {strategy.name}
                  </span>
                </div>
                <p className="text-xs text-[#6e7681] mb-2">{strategy.description}</p>
                <code className="text-[10px] text-[#6e7681] bg-[#0d0d0e] px-2 py-1 rounded">
                  {strategy.example}
                </code>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto Versioning */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f]">
          <h3 className="text-xs font-medium text-[#e6edf3] flex items-center gap-2">
            <GitMerge className="h-3.5 w-3.5 text-[#6e7681]" />
            Automatic Versioning
          </h3>
          <p className="text-[10px] text-[#6e7681] mt-0.5">
            Configure automatic version creation from GitHub releases
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-[#e6edf3]">Enable Auto-Versioning</Label>
              <p className="text-xs text-[#6e7681] mt-0.5">
                Automatically create versions when GitHub releases are published
              </p>
            </div>
            <Switch
              checked={config.autoVersioning}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoVersioning: checked }))}
            />
          </div>

          <div className="pt-2 border-t border-[#1f1f1f] space-y-4">
            <div>
              <Label className="text-sm text-[#e6edf3] mb-2 block">Release Branch</Label>
              <Select
                value={config.releaseBranch}
                onValueChange={(value) => setConfig(prev => ({ ...prev, releaseBranch: value }))}
              >
                <SelectTrigger className="h-9 bg-[#161617] border-[#1f1f1f] text-[#e6edf3]">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(branch => (
                    <SelectItem key={branch} value={branch}>
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3 w-3" />
                        {branch}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[#6e7681] mt-1">
                Releases from this branch will trigger version creation
              </p>
            </div>

            <div>
              <Label className="text-sm text-[#e6edf3] mb-2 block">Version Prefix</Label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={config.versionPrefix}
                  onChange={(e) => setConfig(prev => ({ ...prev, versionPrefix: e.target.value }))}
                  placeholder="v"
                  className="w-16 h-9 px-3 bg-[#161617] border border-[#1f1f1f] rounded-md text-[#e6edf3] text-sm focus:border-[#58a6ff] focus:outline-none"
                />
                <span className="text-xs text-[#6e7681]">+ version number</span>
                <Badge variant="secondary" className="text-[10px] bg-[#161617] text-[#8b949e]">
                  Example: {config.versionPrefix}1.0.0
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Changelog Configuration */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f]">
          <h3 className="text-xs font-medium text-[#e6edf3] flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#6e7681]" />
            AI Changelog Generation
          </h3>
          <p className="text-[10px] text-[#6e7681] mt-0.5">
            Configure automatic changelog generation with AI
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-[#e6edf3]">Auto-Generate Changelog</Label>
              <p className="text-xs text-[#6e7681] mt-0.5">
                Use AI to automatically generate changelogs for new releases
              </p>
            </div>
            <Switch
              checked={config.autoGenerateChangelog}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoGenerateChangelog: checked }))}
            />
          </div>

          <div className="pt-4 border-t border-[#1f1f1f] space-y-3">
            <p className="text-xs text-[#6e7681] font-medium">Include in Changelog:</p>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label className="text-sm text-[#e6edf3]">Commit Messages</Label>
                <p className="text-xs text-[#6e7681] mt-0.5">
                  Include commit messages in generated changelogs
                </p>
              </div>
              <Switch
                checked={config.includeCommitsInChangelog}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeCommitsInChangelog: checked }))}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label className="text-sm text-[#e6edf3]">Pull Request Descriptions</Label>
                <p className="text-xs text-[#6e7681] mt-0.5">
                  Include PR titles and descriptions in generated changelogs
                </p>
              </div>
              <Switch
                checked={config.includePRsInChangelog}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includePRsInChangelog: checked }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info Alert */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-400 mt-0.5" />
        <div>
          <p className="text-xs text-blue-200">
            <strong>How versioning works:</strong> When a release is published on GitHub,
            a version will be automatically created using the configured strategy.
            The changelog will include release notes from GitHub plus any additional
            sources you've enabled above.
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="sm"
          className={cn(
            "h-8",
            hasChanges
              ? "bg-[#238636] hover:bg-[#2ea043] text-white"
              : "bg-[#161617] text-[#8b949e]"
          )}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

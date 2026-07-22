'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  GitBranch,
  RefreshCw,
  Save,
  Loader2,
  GripVertical,
  Check,
  AlertCircle,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Branch {
  id: string;
  name: string;
  headSha: string;
  isDefault?: boolean;
  isProtected?: boolean;
  createdAt: string;
}

interface ProjectStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
}

interface VisualBranchMapperProps {
  repositoryId: string;
  repositoryBranches: Branch[];
  githubBranches: string[];
  loadingBranches: boolean;
  projectStatuses: ProjectStatus[];
  currentMapping: Record<string, string>;
  onRefreshBranches: () => void;
}

const ENVIRONMENTS = [
  { id: 'production', name: 'Production', color: '#22c55e', description: 'Live environment' },
  { id: 'staging', name: 'Staging', color: '#eab308', description: 'Pre-production testing' },
  { id: 'development', name: 'Development', color: '#3b82f6', description: 'Development builds' },
];

export function VisualBranchMapper({
  repositoryId,
  repositoryBranches,
  githubBranches,
  loadingBranches,
  currentMapping,
  onRefreshBranches,
}: VisualBranchMapperProps) {
  const [mappings, setMappings] = useState<Record<string, string>>(currentMapping);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedBranch, setDraggedBranch] = useState<string | null>(null);
  const [dragOverEnv, setDragOverEnv] = useState<string | null>(null);

  const allBranches = Array.from(
    new Set([
      ...repositoryBranches.map(b => b.name),
      ...githubBranches,
    ])
  ).sort();

  const unmappedBranches = allBranches.filter(b => !mappings[b]);

  const branchesByEnvironment = ENVIRONMENTS.reduce((acc, env) => {
    acc[env.id] = Object.entries(mappings)
      .filter(([_, envId]) => envId === env.id)
      .map(([branch]) => branch);
    return acc;
  }, {} as Record<string, string[]>);

  const handleDragStart = (e: React.DragEvent, branch: string) => {
    setDraggedBranch(branch);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', branch);
  };

  const handleDragOver = (e: React.DragEvent, envId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverEnv(envId);
  };

  const handleDragLeave = () => {
    setDragOverEnv(null);
  };

  const handleDrop = (e: React.DragEvent, envId: string) => {
    e.preventDefault();
    const branch = e.dataTransfer.getData('text/plain');
    if (branch) {
      setMappings(prev => ({
        ...prev,
        [branch]: envId,
      }));
    }
    setDraggedBranch(null);
    setDragOverEnv(null);
  };

  const handleDragEnd = () => {
    setDraggedBranch(null);
    setDragOverEnv(null);
  };

  const handleRemoveMapping = (branch: string) => {
    setMappings(prev => {
      const updated = { ...prev };
      delete updated[branch];
      return updated;
    });
  };

  const handleQuickMap = (branch: string, envId: string) => {
    setMappings(prev => ({
      ...prev,
      [branch]: envId,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/github/repositories/${repositoryId}/configuration`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchEnvironmentMap: mappings,
        }),
      });

      if (response.ok) {
        toast.success('Branch mappings saved');
      } else {
        toast.error('Failed to save mappings');
      }
    } catch (error) {
      toast.error('Failed to save mappings');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(mappings) !== JSON.stringify(currentMapping);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-collab-50">Branch to Environment Mapping</h3>
          <p className="text-xs text-collab-500 mt-0.5">
            Drag and drop branches to assign them to deployment environments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshBranches}
            disabled={loadingBranches}
            className="h-8 px-3 text-collab-400 hover:text-collab-50 hover:bg-collab-900"
          >
            {loadingBranches ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            size="sm"
            className={cn(
              "h-8",
              hasChanges
                ? "bg-green-700 hover:bg-green-600 text-white"
                : "bg-collab-900 text-collab-400"
            )}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Visual Mapper */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Unmapped Branches Pool */}
        <div className="rounded-lg border border-collab-700 bg-collab-900 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-collab-700">
            <h4 className="text-xs font-medium text-collab-50 flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-collab-500" />
              Available Branches
            </h4>
            <p className="text-[10px] text-collab-500 mt-0.5">Drag to an environment</p>
          </div>
          <ScrollArea className="h-[360px]">
            <div className="p-2">
              {unmappedBranches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Check className="h-6 w-6 text-green-500 mb-2" />
                  <p className="text-xs text-collab-500">All branches mapped</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {unmappedBranches.map(branch => (
                    <div
                      key={branch}
                      draggable
                      onDragStart={e => handleDragStart(e, branch)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing transition-all group",
                        "bg-collab-900 hover:bg-collab-800 border border-transparent hover:border-collab-600",
                        draggedBranch === branch && "opacity-50 border-blue-400"
                      )}
                    >
                      <GripVertical className="h-3 w-3 text-collab-500" />
                      <GitBranch className="h-3 w-3 text-collab-500" />
                      <span className="text-xs text-collab-50 flex-1 truncate font-mono">
                        {branch}
                      </span>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {ENVIRONMENTS.map(env => (
                          <Button
                            key={env.id}
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickMap(branch, env.id);
                            }}
                            className="w-2.5 h-2.5 rounded-full transition-transform hover:scale-125 p-0"
                            style={{ backgroundColor: env.color }}
                            title={`Map to ${env.name}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Environment Columns */}
        {ENVIRONMENTS.map(env => (
          <div
            key={env.id}
            className={cn(
              "rounded-lg border bg-collab-900 overflow-hidden transition-all",
              dragOverEnv === env.id
                ? "border-2 border-dashed"
                : "border-collab-700"
            )}
            style={{
              borderColor: dragOverEnv === env.id ? env.color : undefined,
            }}
            onDragOver={e => handleDragOver(e, env.id)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, env.id)}
          >
            <div className="px-3 py-2.5 border-b border-collab-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: env.color }}
                />
                <h4 className="text-xs font-medium text-collab-50">{env.name}</h4>
              </div>
              <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-collab-900 text-collab-400">
                {branchesByEnvironment[env.id]?.length || 0}
              </Badge>
            </div>
            <div
              className={cn(
                "min-h-[320px] p-2 transition-all",
                dragOverEnv === env.id && "bg-opacity-10"
              )}
              style={{
                backgroundColor: dragOverEnv === env.id ? `${env.color}08` : undefined,
              }}
            >
              {branchesByEnvironment[env.id]?.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[10px] text-collab-500">Drop branches here</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {branchesByEnvironment[env.id]?.map(branch => (
                    <div
                      key={branch}
                      draggable
                      onDragStart={e => handleDragStart(e, branch)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing group",
                        "bg-collab-900 hover:bg-collab-800 border border-transparent hover:border-collab-600",
                        draggedBranch === branch && "opacity-50"
                      )}
                    >
                      <GripVertical className="h-3 w-3 text-collab-500" />
                      <GitBranch className="h-3 w-3" style={{ color: env.color }} />
                      <span className="text-xs text-collab-50 flex-1 truncate font-mono">
                        {branch}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => handleRemoveMapping(branch)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/20 rounded transition-opacity h-auto"
                      >
                        <X className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border border-collab-700 bg-collab-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-collab-700">
          <h4 className="text-xs font-medium text-collab-50">Quick Setup</h4>
          <p className="text-[10px] text-collab-500 mt-0.5">Apply common branch mapping patterns</p>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs text-collab-400 hover:text-collab-50 hover:bg-collab-900 border border-collab-700"
            onClick={() => {
              setMappings({
                main: 'production',
                master: 'production',
                develop: 'development',
                dev: 'development',
                staging: 'staging',
              });
            }}
          >
            GitFlow Pattern
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs text-collab-400 hover:text-collab-50 hover:bg-collab-900 border border-collab-700"
            onClick={() => {
              setMappings({
                main: 'production',
                master: 'production',
              });
            }}
          >
            Simple (main only)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs text-collab-400 hover:text-collab-50 hover:bg-collab-900 border border-collab-700"
            onClick={() => setMappings({})}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5" />
        <div>
          <p className="text-xs text-blue-200">
            <strong>How it works:</strong> When a commit is pushed to a mapped branch,
            a version will be created for the corresponding environment.
          </p>
        </div>
      </div>
    </div>
  );
}

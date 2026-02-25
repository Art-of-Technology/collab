"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateIssue } from '@/hooks/queries/useIssues';
import { IssueAssigneeSelector } from '@/components/issue/selectors/IssueAssigneeSelector';
import { IssuePrioritySelector } from '@/components/issue/selectors/IssuePrioritySelector';
import { IssueTypeSelector } from '@/components/issue/selectors/IssueTypeSelector';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FolderOpen, ChevronDown } from "lucide-react";
import { cn } from '@/lib/utils';
import type { IssuePriority } from '@/types/issue';
import type { IssueType } from '@/constants/issue-types';

interface QuickIssueCreateProps {
  columnId: string;
  columnStatus: string;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    issuePrefix: string;
    color?: string;
  }>;
  workspaceId: string;
  currentUserId: string;
  onCancel: () => void;
  onCreated: (issue: any) => void;
}

export default function QuickIssueCreate({
  columnId,
  columnStatus,
  projects,
  workspaceId,
  currentUserId,
  onCancel,
  onCreated
}: QuickIssueCreateProps) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [priority, setPriority] = useState<IssuePriority>('MEDIUM');
  const [issueType, setIssueType] = useState<IssueType>('TASK');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects.length === 1 ? projects[0].id : ''
  );
  
  const hasMultipleProjects = projects.length > 1;
  
  const createIssueMutation = useCreateIssue();

  const handleSubmit = async () => {
    if (!title.trim()) return;
    if (hasMultipleProjects && !selectedProjectId) return; // Must select project if multiple

    try {
      const result = await createIssueMutation.mutateAsync({
        title: title.trim(),
        type: issueType,
        status: columnStatus,
        priority,
        projectId: selectedProjectId,
        workspaceId,
        assigneeId,
        reporterId: currentUserId,
      });

      // Reset form
      setTitle('');
      setAssigneeId(undefined);
      setPriority('MEDIUM');
      setIssueType('TASK');
      if (hasMultipleProjects) {
        setSelectedProjectId('');
      }

      // Notify parent component (ViewRenderer handles query invalidation)
      onCreated(result.issue);
    } catch (error) {
      console.error('Failed to create issue:', error);
      // TODO: Show error toast/notification
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      // Prevent duplicate submissions by checking pending state
      if (!createIssueMutation.isPending) {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const canSubmit = title.trim() && (!hasMultipleProjects || selectedProjectId);

  return (
    <div className="p-3 bg-collab-700 rounded-lg border border-collab-600 space-y-3">
      {/* Title Input */}
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Issue title..."
        onKeyDown={handleKeyDown}
        className="bg-collab-900 border-collab-600 focus:border-collab-600 text-collab-400"
        autoFocus
      />

      {/* Inline Selectors */}
      <div className="flex flex-wrap gap-2">
        {/* Project Selector - only show if multiple projects */}
        {hasMultipleProjects && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md border border-collab-600 bg-collab-900 px-2 text-xs",
                  "hover:bg-collab-600 focus:border-collab-600 focus:outline-none focus:ring-1 focus:ring-collab-600",
                  selectedProjectId ? "text-collab-400" : "text-collab-500"
                )}
              >
                <FolderOpen className="h-3 w-3" />
                <span className="truncate max-w-20">
                  {selectedProjectId
                    ? projects.find(p => p.id === selectedProjectId)?.name || "Select project..."
                    : "Select project..."
                  }
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0 bg-collab-800 border-collab-600" align="start">
              <div className="p-1">
                {projects.map((project) => (
                  <Button
                    key={project.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm text-left h-auto justify-start",
                      "hover:bg-collab-600 transition-colors",
                      selectedProjectId === project.id
                        ? "bg-collab-600 text-collab-400"
                        : "text-collab-400"
                    )}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: project.color || '#6b7280' }}
                    />
                    <span className="truncate">{project.name}</span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        
        <IssueTypeSelector
          value={issueType}
          onChange={setIssueType}
        />
        
        <IssuePrioritySelector
          value={priority}
          onChange={setPriority}
        />
        
        <IssueAssigneeSelector
          value={assigneeId}
          onChange={setAssigneeId}
          workspaceId={workspaceId}
          placeholder="Assign to..."
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit || createIssueMutation.isPending}
          className="bg-green-700 hover:bg-green-600 text-white h-7 text-xs"
        >
          {createIssueMutation.isPending ? 'Creating...' : 'Create'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-collab-500 hover:text-collab-400 hover:bg-collab-600 h-7 text-xs"
        >
          Cancel
        </Button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-collab-500 pt-1">
        <kbd className="px-1 py-0.5 bg-collab-600 rounded text-[10px]">⌘ + Enter</kbd> to create, <kbd className="px-1 py-0.5 bg-collab-600 rounded text-[10px]">Esc</kbd> to cancel
      </div>
    </div>
  );
}

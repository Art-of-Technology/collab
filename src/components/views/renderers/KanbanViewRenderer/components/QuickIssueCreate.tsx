"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateIssue } from '@/hooks/queries/useIssues';
import { IssueAssigneeSelector } from '@/components/issue/selectors/IssueAssigneeSelector';
import { IssuePrioritySelector } from '@/components/issue/selectors/IssuePrioritySelector';
import { IssueTypeSelector } from '@/components/issue/selectors/IssueTypeSelector';
import { IssueReporterSelector } from '@/components/issue/selectors/IssueReporterSelector';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IssuePriority, IssueType } from '@/types/issue';

interface QuickIssueCreateProps {
  columnId: string;
  columnStatus: string;
  projectId: string;
  workspaceId: string;
  currentUserId: string;
  onCancel: () => void;
  onCreated: (issue: any) => void;
}

export default function QuickIssueCreate({
  columnId,
  columnStatus,
  projectId,
  workspaceId,
  currentUserId,
  onCancel,
  onCreated
}: QuickIssueCreateProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [reporterId, setReporterId] = useState<string | undefined>(currentUserId);
  const [priority, setPriority] = useState<IssuePriority>('MEDIUM');
  const [issueType, setIssueType] = useState<IssueType>('TASK');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const createIssueMutation = useCreateIssue();

  // Auto-set reporter to current user
  useEffect(() => {
    setReporterId(currentUserId);
  }, [currentUserId]);

  const handleSubmit = async () => {
    if (!title.trim()) return;

    try {
      const result = await createIssueMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        type: issueType,
        status: columnStatus,
        priority,
        projectId,
        workspaceId,
        assigneeId,
        reporterId,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setAssigneeId(undefined);
      setReporterId(currentUserId);
      setPriority('MEDIUM');
      setIssueType('TASK');
      setShowAdvanced(false);

      // Notify parent component
      onCreated(result.issue);
    } catch (error) {
      console.error('Failed to create issue:', error);
      // TODO: Show error toast/notification
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="p-3 bg-[#1f1f1f] rounded-lg border border-[#2a2a2a] space-y-3">
      {/* Title Input */}
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Issue title..."
        onKeyDown={handleKeyDown}
        className="bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc]"
        autoFocus
      />

      {/* Advanced Options Toggle */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[#6e7681] hover:text-[#cccccc] h-6 px-2 text-xs"
        >
          {showAdvanced ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Hide options
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              More options
            </>
          )}
        </Button>
      </div>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="space-y-3">
          {/* Description */}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            className="bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc] min-h-[60px] resize-none"
            onKeyDown={handleKeyDown}
          />

          {/* Selectors */}
          <div className="flex flex-wrap gap-2">
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
            
            <IssueReporterSelector
              value={reporterId}
              onChange={setReporterId}
              workspaceId={workspaceId}
              placeholder="Reporter..."
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!title.trim() || createIssueMutation.isPending}
          className="bg-[#238636] hover:bg-[#2ea043] text-white h-7 text-xs"
        >
          {createIssueMutation.isPending ? 'Creating...' : 'Create'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-[#6e7681] hover:text-[#cccccc] hover:bg-[#2a2a2a] h-7 text-xs"
        >
          Cancel
        </Button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-[#6e7681] pt-1">
        <kbd className="px-1 py-0.5 bg-[#2d2d30] rounded text-[10px]">⌘ + Enter</kbd> to create, <kbd className="px-1 py-0.5 bg-[#2d2d30] rounded text-[10px]">Esc</kbd> to cancel
      </div>
    </div>
  );
}

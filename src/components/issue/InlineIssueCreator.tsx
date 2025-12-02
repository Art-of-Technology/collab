"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Search, Loader2, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueProjectSelector } from "./selectors/IssueProjectSelector";
import { IssueStatusSelector } from "./selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "./selectors/IssuePrioritySelector";
import { IssueAssigneeSelector } from "./selectors/IssueAssigneeSelector";
import { IssueRelationTypeSelector } from "./selectors/IssueRelationTypeSelector";
import { IssueTypeSelector } from "./selectors/IssueTypeSelector";
import { IssueDateSelector } from "./selectors/IssueDateSelector";
import { IssueLabelSelector } from "./selectors/IssueLabelSelector";
import { RichEditor } from "@/components/RichEditor";
import type { IssueRelationType } from "./sections/relations/types/relation";
import type { IssuePriority } from "@/types/issue";
import type { IssueType } from "@/constants/issue-types";
import { useCreateIssue } from "@/hooks/queries/useIssues";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface InlineIssueCreatorProps {
  workspaceId: string;
  projectId?: string;
  parentIssueId?: string;
  parentIssueKey?: string;
  defaultRelationType?: IssueRelationType;
  defaultAssigneeId?: string;
  onIssueCreated?: (issueId: string, issueKey: string) => void;
  onLinkExisting?: (relations: Array<{ item: any; relationType: IssueRelationType }>) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}

type CreationMode = 'create' | 'link';

export function InlineIssueCreator({
  workspaceId,
  projectId: defaultProjectId,
  parentIssueId,
  parentIssueKey,
  defaultRelationType = 'child',
  defaultAssigneeId,
  onIssueCreated,
  onLinkExisting,
  onCancel,
  autoFocus = false,
  className,
}: InlineIssueCreatorProps) {
  const [isExpanded, setIsExpanded] = useState(autoFocus);
  const [mode, setMode] = useState<CreationMode>('create');
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(defaultProjectId);
  const [statusId, setStatusId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<IssuePriority>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState<string | undefined>(defaultAssigneeId);
  const [relationType, setRelationType] = useState<IssueRelationType>(defaultRelationType);
  const [type, setType] = useState<IssueType>("TASK");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<any[]>([]);
  const [isLinking, setIsLinking] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createIssueMutation = useCreateIssue();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-focus when expanded
  useEffect(() => {
    if (isExpanded && mode === 'create') {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    } else if (isExpanded && mode === 'link') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isExpanded, mode]);

  // Search for issues to link
  useEffect(() => {
    if (mode !== 'link' || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchIssues = async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({
          workspace: workspaceId,
          q: searchQuery,
        });

        const response = await fetch(`/api/issues/search?${params}`);
        if (!response.ok) throw new Error('Failed to search issues');

        const data = await response.json();
        // The search endpoint returns an array directly, not wrapped in { issues: [] }
        const issues = Array.isArray(data) ? data : [];
        // Filter out the parent issue and already selected issues
        const filtered = issues.filter((issue: any) =>
          issue.id !== parentIssueId &&
          !selectedIssues.some(selected => selected.id === issue.id)
        );
        setSearchResults(filtered);
      } catch (error) {
        console.error('Error searching issues:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchIssues, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, mode, workspaceId, parentIssueId, selectedIssues]);

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    setTitle("");
    setDescription("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedIssues([]);
    setMode('create');
    setType("TASK");
    setDueDate(undefined);
    setLabelIds([]);
    onCancel?.();
  };

  const handleCreate = async () => {
    if (!title.trim() || !projectId) {
      toast({
        title: "Validation Error",
        description: "Title and project are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createIssueMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        status: statusId,
        priority,
        projectId,
        workspaceId,
        assigneeId,
        parentId: relationType === 'child' ? parentIssueId : undefined,
        dueDate: dueDate,
        labels: labelIds.length > 0 ? labelIds : undefined,
      });

      const newIssueId = result.issue?.id || result.id;
      const newIssueKey = result.issue?.issueKey || result.issueKey;

      // If it's not a child relation, we need to create the relation separately
      if (relationType !== 'child' && parentIssueKey && newIssueId) {
        try {
          const relationResponse = await fetch(`/api/workspaces/${workspaceId}/issues/${parentIssueKey}/relations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetIssueId: newIssueId, // Use ID instead of key to match API contract
              relationType,
            }),
          });

          if (!relationResponse.ok) {
            const errorData = await relationResponse.json().catch(() => ({}));
            console.error('Failed to create relation:', errorData);
            toast({
              title: "Issue created, but relation failed",
              description: `${newIssueKey} was created but linking failed: ${errorData.error || 'Unknown error'}`,
              variant: "destructive",
            });
            // Invalidate relations query to refresh relations section
            queryClient.invalidateQueries({
              queryKey: ["issue-relations", workspaceId, parentIssueKey],
            });
            onIssueCreated?.(newIssueId, newIssueKey);
            return;
          }

          // Invalidate relations query after successful relation creation
          queryClient.invalidateQueries({
            queryKey: ["issue-relations", workspaceId, parentIssueKey],
          });
        } catch (error) {
          console.error('Error creating relation:', error);
          toast({
            title: "Issue created, but relation failed",
            description: `${newIssueKey} was created but linking failed. Please link manually.`,
            variant: "destructive",
          });
          // Invalidate relations query even on error to show current state
          queryClient.invalidateQueries({
            queryKey: ["issue-relations", workspaceId, parentIssueKey],
          });
          onIssueCreated?.(newIssueId, newIssueKey);
          return;
        }
      } else if (relationType === 'child' && parentIssueKey) {
        // For child relations, invalidate the parent's relations query
        queryClient.invalidateQueries({
          queryKey: ["issue-relations", workspaceId, parentIssueKey],
        });
      }

      toast({
        title: "Issue created",
        description: `${newIssueKey} has been created successfully`,
      });

      onIssueCreated?.(newIssueId, newIssueKey);

      // Reset form
      setTitle("");
      setDescription("");
      setStatusId(undefined);
      setPriority("MEDIUM");
      setAssigneeId(defaultAssigneeId);
      setType("TASK");
      setDueDate(undefined);
      setLabelIds([]);

      // Keep expanded for quick creation
      titleInputRef.current?.focus();
    } catch (error) {
      console.error('Error creating issue:', error);
      toast({
        title: "Error",
        description: "Failed to create issue",
        variant: "destructive",
      });
    }
  };

  const handleLinkSelected = async () => {
    if (selectedIssues.length === 0 || !onLinkExisting || isLinking) return;

    setIsLinking(true);
    try {
      const relations = selectedIssues.map(issue => ({
        item: {
          id: issue.issueKey || issue.id,
          dbId: issue.id,
          title: issue.title,
          issueKey: issue.issueKey,
          status: issue.status,
          priority: issue.priority,
          type: issue.type,
          assignee: issue.assignee,
          project: issue.project,
          workspace: issue.workspace,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        },
        relationType,
      }));

      await onLinkExisting(relations);

      toast({
        title: "Issues linked",
        description: `${selectedIssues.length} issue(s) linked successfully`,
      });

      // Reset
      setSelectedIssues([]);
      setSearchQuery("");
      setSearchResults([]);
      handleCollapse();
    } catch (error) {
      console.error('Error linking issues:', error);
      toast({
        title: "Error",
        description: "Failed to link issues",
        variant: "destructive",
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCollapse();
    } else if (e.key === 'Enter' && mode === 'create' && (e.metaKey || e.ctrlKey)) {
      handleCreate();
    }
  };

  const toggleIssueSelection = (issue: any) => {
    setSelectedIssues(prev => {
      const isSelected = prev.some(i => i.id === issue.id);
      if (isSelected) {
        return prev.filter(i => i.id !== issue.id);
      } else {
        return [...prev, issue];
      }
    });
  };

  if (!isExpanded) {
    return (
      <div className={cn("group", className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExpand}
          className="h-6 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a] border border-transparent hover:border-[#333] transition-all w-full justify-start"
        >
          <Plus className="h-3 w-3 mr-1.5" />
          Add {defaultRelationType === 'child' ? 'sub-issue' : 'relation'}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border border-[#2d2d30] rounded-md bg-[#0d0d0d] overflow-hidden",
        className
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="p-2.5 space-y-2.5">
        {/* Mode Toggle - Compact */}
        {onLinkExisting && (
          <div className="flex items-center gap-1 pb-2 border-b border-[#1a1a1a]">
            <button
              onClick={() => setMode('create')}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded transition-colors",
                mode === 'create'
                  ? "bg-[#1a1a1a] text-[#e1e7ef]"
                  : "text-[#7d8590] hover:text-[#c9d1d9]"
              )}
            >
              Create
            </button>
            <button
              onClick={() => setMode('link')}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded transition-colors flex items-center gap-1",
                mode === 'link'
                  ? "bg-[#1a1a1a] text-[#e1e7ef]"
                  : "text-[#7d8590] hover:text-[#c9d1d9]"
              )}
            >
              <LinkIcon className="h-2.5 w-2.5" />
              Link
            </button>
          </div>
        )}

        {mode === 'create' ? (
          <>
            {/* Title and Description */}
            <div className="space-y-1">
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Issue title"
                className="w-full bg-transparent border-0 text-sm text-[#e1e7ef] placeholder:text-[#7d8590] focus:outline-none px-0 py-1"
              />

              <div className="pt-1">
                <RichEditor
                  value={description}
                  onChange={(html) => setDescription(html)}
                  placeholder="Add description..."
                  minHeight="60px"
                  toolbarMode="floating"
                  showAiImprove={false}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#1a1a1a] -mx-2.5" />

            {/* Selectors Row */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Relation Type */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#7d8590]">as</span>
                <IssueRelationTypeSelector
                  value={relationType}
                  onChange={setRelationType}
                />
              </div>

              {/* Project Selector */}
              <IssueProjectSelector
                value={projectId}
                onChange={setProjectId}
                workspaceId={workspaceId}
              />

              {/* Status Selector */}
              {projectId && (
                <IssueStatusSelector
                  value={statusId}
                  onChange={setStatusId}
                  projectId={projectId}
                  workspaceId={workspaceId}
                />
              )}

              {/* Priority Selector */}
              <IssuePrioritySelector
                value={priority}
                onChange={setPriority}
              />

              {/* Assignee Selector */}
              <IssueAssigneeSelector
                value={assigneeId}
                onChange={setAssigneeId}
                workspaceId={workspaceId}
              />

              {/* Type Selector */}
              <IssueTypeSelector
                value={type}
                onChange={setType}
              />

              {/* Due Date Selector */}
              <IssueDateSelector
                value={dueDate}
                onChange={setDueDate}
              />

              {/* Label Selector */}
              <IssueLabelSelector
                value={labelIds}
                onChange={setLabelIds}
                workspaceId={workspaceId}
              />
            </div>

            {/* Actions - Compact */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!title.trim() || !projectId || createIssueMutation.isPending}
                className="h-6 px-2 text-xs bg-[#238636] hover:bg-[#2ea043] text-white"
              >
                {createIssueMutation.isPending ? (
                  <>
                    <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCollapse}
                className="h-6 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a]"
              >
                Cancel
              </Button>
              <span className="text-[10px] text-[#6e7681] ml-auto">
                <kbd className="px-1 py-0.5 text-[9px] bg-[#1a1a1a] border border-[#2d2d30] rounded">Esc</kbd>
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7d8590] pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search issues to link..."
                className="bg-[#0a0a0a] border-[#2d2d30] text-sm focus:border-[#404040] h-8 pl-8 pr-8"
              />
              {isSearching && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7d8590] animate-spin pointer-events-none" />
              )}
              {searchQuery.length > 0 && !isSearching && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-[#6e7681] hover:text-[#8b949e] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Relation Type for linking */}
            <div className="flex items-center gap-1.5 pb-2">
              <span className="text-xs text-[#7d8590]">Link as</span>
              <IssueRelationTypeSelector
                value={relationType}
                onChange={setRelationType}
              />
            </div>

            {/* Selected Issues */}
            {selectedIssues.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedIssues.map(issue => (
                  <Badge
                    key={issue.id}
                    variant="outline"
                    className="text-xs bg-[#1a1a1a] border-[#333] text-[#e1e7ef] pr-1"
                  >
                    <span className="text-[#7d8590] mr-1">{issue.issueKey}</span>
                    {issue.title.substring(0, 30)}{issue.title.length > 30 ? '...' : ''}
                    <button
                      onClick={() => toggleIssueSelection(issue)}
                      className="ml-1 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Search States */}
            {searchQuery.length < 2 && (
              <div className="text-xs text-[#6e7681] text-center py-6 space-y-1">
                <p className="text-[#8b949e]">Type to search for issues</p>
                <p className="text-[#6e7681]">Search by issue key, title, or description</p>
              </div>
            )}

            {searchQuery.length >= 2 && isSearching && (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#7d8590]" />
                <span className="text-xs text-[#7d8590]">Searching...</span>
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <div className="text-center py-6 space-y-1">
                <p className="text-xs text-[#8b949e]">No issues found</p>
                <p className="text-xs text-[#6e7681]">Try a different search term</p>
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-[#2d2d30] rounded bg-[#0a0a0a]">
                {searchResults.map(issue => {
                  const isSelected = selectedIssues.some(i => i.id === issue.id);
                  return (
                    <button
                      key={issue.id}
                      onClick={() => toggleIssueSelection(issue)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs hover:bg-[#1a1a1a] border-b border-[#1a1a1a] last:border-b-0 transition-colors",
                        isSelected && "bg-[#1a1a1a]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-3 h-3 rounded border flex items-center justify-center flex-shrink-0",
                          isSelected ? "bg-[#238636] border-[#238636]" : "border-[#7d8590]"
                        )}>
                          {isSelected && <Check className="h-2 w-2 text-white" />}
                        </div>
                        <span className="text-[#7d8590] font-mono flex-shrink-0">{issue.issueKey}</span>
                        <span className="text-[#e1e7ef] flex-1 truncate">{issue.title}</span>
                        {issue.project && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-[#2d2d30] flex-shrink-0">
                            {issue.project.name}
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Actions - Compact */}
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={handleLinkSelected}
                disabled={selectedIssues.length === 0 || isLinking}
                className="h-6 px-2 text-xs bg-[#238636] hover:bg-[#2ea043] text-white"
              >
                {isLinking ? (
                  <>
                    <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>Link {selectedIssues.length > 0 && `(${selectedIssues.length})`}</>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCollapse}
                className="h-6 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a]"
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Import Check icon
function Check({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
    </svg>
  );
}


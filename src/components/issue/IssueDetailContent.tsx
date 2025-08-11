"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, 
  X, 
  Check, 
  PenLine, 
  MessageSquare,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Star,
  Command,
  Clock,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import BoardItemActivityHistory from "@/components/activity/BoardItemActivityHistory";
import { IssueTabs } from "./sections/IssueTabs";
import { IssueDescriptionEditor } from "@/components/issue";
import { IssueAssigneeSelector } from "@/components/issue/selectors/IssueAssigneeSelector";
import { IssueStatusSelector } from "@/components/issue/selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "@/components/issue/selectors/IssuePrioritySelector";
import { IssueReporterSelector } from "@/components/issue/selectors/IssueReporterSelector";
import { IssueLabelSelector } from "@/components/issue/selectors/IssueLabelSelector";
import { IssueTypeSelector } from "@/components/issue/selectors/IssueTypeSelector";
import { IssueProjectSelector } from "@/components/issue/selectors/IssueProjectSelector";
import { IssueDateSelector } from "@/components/issue/selectors/IssueDateSelector";

// Import types
import type { Issue, IssueDetailProps, IssueFieldUpdate } from "@/types/issue";

// Helper function for getting type color (still used for the type indicator dot)
const getTypeColor = (type: string) => {
  const colors = {
    'EPIC': '#8b5cf6',
    'STORY': '#3b82f6', 
    'TASK': '#10b981',
    'DEFECT': '#ef4444',
    'MILESTONE': '#f59e0b',
    'SUBTASK': '#6b7280'
  };
  return colors[type as keyof typeof colors] || '#6b7280';
};

interface IssueDetailContentProps extends IssueDetailProps {
  mode?: 'modal' | 'page';
  workspaceId?: string;
  issueId?: string;
}

export function IssueDetailContent({
  issue,
  error,
  isLoading = false,
  onRefresh,
  onClose,
  boardId,
  mode = 'modal',
  workspaceId,
  issueId
}: IssueDetailContentProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionHasChanges, setDescriptionHasChanges] = useState(false);
  const [isDescriptionSaving, setIsDescriptionSaving] = useState(false);
  const [labels, setLabels] = useState<any[]>([]);
  const { toast } = useToast();

  // Initialize local state from issue data
  useEffect(() => {
    if (issue) {
      setTitle(issue.title || '');
      setDescription(issue.description || '');
      setDescriptionHasChanges(false);

    }
  }, [issue]);

  // Fetch labels for the workspace
  useEffect(() => {
    if (!workspaceId) return;

    const fetchLabels = async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/labels`);
        if (response.ok) {
          const data = await response.json();
          setLabels(data.labels || []);
        }
      } catch (error) {
        console.error('Error fetching labels:', error);
        setLabels([]);
      }
    };

    fetchLabels();
  }, [workspaceId]);

  // Handle field updates with optimistic UI
  const handleUpdate = useCallback(async (updates: IssueFieldUpdate) => {
    if (!issue) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/issues/${issue.issueKey || issue.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(errorData.message || errorData.error || `Failed to update issue (${response.status})`);
      }

      toast({
        title: "Updated",
        description: "Issue updated successfully",
      });

      // Refresh the issue data
      onRefresh();
    } catch (error) {
      console.error('Failed to update issue:', error);
      toast({
        title: "Error",
        description: "Failed to update issue",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, [issue, onRefresh, toast]);

  // Handle title save
  const handleSaveTitle = useCallback(async () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      await handleUpdate({ title });
      setEditingTitle(false);
    } catch (error) {
      // Error already handled in handleUpdate
    }
  }, [title, handleUpdate, toast]);

  // Handle description save
  const handleSaveDescription = useCallback(async () => {
    if (!descriptionHasChanges) return;
    
    setIsDescriptionSaving(true);
    try {
      await handleUpdate({ description });
      setDescriptionHasChanges(false);
      toast({
        title: "Description saved",
        description: "Issue description has been updated",
      });
    } catch (error) {
      // Error already handled in handleUpdate
    } finally {
      setIsDescriptionSaving(false);
    }
  }, [description, handleUpdate, descriptionHasChanges, toast]);

  // Handle description change and detect changes
  const handleDescriptionChange = useCallback((newDescription: string) => {
    setDescription(newDescription);
    setDescriptionHasChanges(newDescription !== (issue?.description || ''));
  }, [issue?.description]);

  // AI Improve function for description editor
  const handleAiImprove = useCallback(async (text: string): Promise<string> => {
    try {
      const response = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to improve text');
      }
      
      const data = await response.json();
      return data.improvedText || text;
    } catch (error) {
      console.error('Error improving text:', error);
      toast({
        title: "Error",
        description: "Failed to improve text with AI",
        variant: "destructive",
      });
      throw error;
    }
  }, [toast]);



  // Handle copy link
  const handleCopyLink = useCallback(() => {
    if (!issue?.issueKey) return;

    const url = `${window.location.origin}/${workspaceId}/issues/${issue.issueKey}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link copied",
        description: "Issue link copied to clipboard",
      });
    }).catch(() => {
      toast({
        title: "Failed to copy",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    });
  }, [issue, workspaceId, toast]);

  // Handle open in new tab
  const handleOpenInNewTab = useCallback(() => {
    if (!issue?.issueKey || !workspaceId) return;
    
    const url = `/${workspaceId}/issues/${issue.issueKey}`;
    window.open(url, '_blank');
  }, [issue, workspaceId]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        switch (event.key) {
          case 'c':
            if (!editingTitle) {
              event.preventDefault();
              handleCopyLink();
            }
            break;
          case 's':
            if (descriptionHasChanges && !isDescriptionSaving) {
              event.preventDefault();
              handleSaveDescription();
            }
            break;
          case 'Enter':
            if (editingTitle) {
              event.preventDefault();
              handleSaveTitle();
            }
            break;
        }
      }
      
      if (event.key === 'Escape') {
        if (editingTitle) {
          setEditingTitle(false);
          setTitle(issue?.title || '');
        } else if (mode === 'modal') {
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingTitle, handleSaveTitle, handleCopyLink, issue, mode, onClose, descriptionHasChanges, isDescriptionSaving, handleSaveDescription]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#8b949e]" />
          <p className="text-[#8b949e] text-sm">Loading issue...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="p-8 border border-[#1f1f1f] bg-[#0a0a0a] rounded-lg">
          <div className="space-y-4">
            <div className="text-red-400 font-semibold">Error</div>
            <p className="text-[#8b949e]">{error}</p>
            <div className="flex justify-center gap-2">
              <Button
                onClick={onRefresh}
                size="sm"
                className="bg-[#238636] hover:bg-[#2ea043] text-white"
              >
                Try Again
              </Button>
              {onClose && (
                <Button
                  onClick={onClose}
                  variant="outline"
                  size="sm"
                  className="border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!issue) {
    return (
      <div className="text-center py-12">
        <div className="p-8 border border-[#1f1f1f] bg-[#0a0a0a] rounded-lg">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-white">Issue not found</div>
            <p className="text-[#8b949e]">
              The issue you're looking for doesn't exist or you don't have permission to view it.
            </p>
            {onClose && (
              <Button
                onClick={onClose}
                variant="outline"
                size="sm"
                className="border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      mode === 'modal' ? "h-full" : "min-h-screen",
      "flex flex-col",
      mode === 'page' ? "max-w-7xl mx-auto p-6" : "p-6",
      "bg-[#0a0a0a] text-white transition-opacity duration-200",
      isUpdating && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex-none space-y-4 mb-6">
        {/* Top action bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Issue Key */}
            <Badge 
              className="font-mono text-xs px-2 py-1 bg-[#1f1f1f] border-[#333] text-[#8b949e] hover:bg-[#333] transition-colors cursor-pointer"
              onClick={handleCopyLink}
            >
              {issue.issueKey}
            </Badge>
            
            {/* Type Indicator */}
            <div 
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getTypeColor(issue.type) }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="h-8 w-8 p-0 text-[#8b949e] hover:text-white hover:bg-[#1f1f1f]"
            >
              <Copy className="h-4 w-4" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-[#8b949e] hover:text-white hover:bg-[#1f1f1f]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1f1f1f] border-[#333]">
                <DropdownMenuItem 
                  className="text-[#8b949e] hover:text-white hover:bg-[#333]"
                  onClick={handleOpenInNewTab}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in new tab
                </DropdownMenuItem>
                <DropdownMenuItem className="text-[#8b949e] hover:text-white hover:bg-[#333]">
                  <Star className="h-4 w-4 mr-2" />
                  Add to favorites
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#333]" />
                <DropdownMenuItem className="text-red-400 hover:text-red-300 hover:bg-[#333]">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete issue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {mode === 'modal' && onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0 text-[#8b949e] hover:text-white hover:bg-[#1f1f1f]"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          {editingTitle ? (
            <div className="space-y-3">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-semibold bg-[#1f1f1f] border-[#333] text-white placeholder-[#6e7681] focus:border-[#58a6ff] h-auto py-2"
                placeholder="Issue title"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveTitle();
                  } else if (e.key === 'Escape') {
                    setEditingTitle(false);
                    setTitle(issue.title);
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveTitle}
                  disabled={isUpdating}
                  className="h-8 bg-[#238636] hover:bg-[#2ea043] text-white"
                >
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingTitle(false);
                    setTitle(issue.title);
                  }}
                  disabled={isUpdating}
                  className="h-8 border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="group cursor-pointer flex items-center gap-2"
              onClick={() => setEditingTitle(true)}
            >
              <h1 className="text-xl font-semibold text-white group-hover:text-[#58a6ff] transition-colors">
                {issue.title}
              </h1>
              <PenLine className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-[#6e7681]" />
            </div>
          )}

          {/* Properties Row - Using New Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Selector */}
            <IssueStatusSelector
              value={issue.status}
              onChange={(value) => handleUpdate({ status: value })}
              projectId={issue.projectId}
              disabled={isUpdating}
            />

            {/* Priority Selector */}
            <IssuePrioritySelector
              value={issue.priority || 'MEDIUM'}
              onChange={(value) => handleUpdate({ priority: value })}
              disabled={isUpdating}
            />

            {/* Type Selector */}
            <IssueTypeSelector
              value={issue.type}
              onChange={(value) => handleUpdate({ type: value })}
              disabled={isUpdating}
            />

            {/* Assignee Selector */}
            <IssueAssigneeSelector
              value={issue.assigneeId}
              onChange={(value) => handleUpdate({ assigneeId: value })}
              workspaceId={workspaceId}
              disabled={isUpdating}
            />

            {/* Reporter Selector */}
            <IssueReporterSelector
              value={issue.reporterId}
              onChange={(value) => handleUpdate({ reporterId: value })}
              workspaceId={workspaceId}
              disabled={isUpdating}
            />

            {/* Labels Selector */}
            <IssueLabelSelector
              value={issue.labels?.map(l => l.id) || []}
              onChange={(labelIds) => {
                // Convert label IDs back to label objects for the update
                const labelObjects = labels.filter(label => labelIds.includes(label.id));
                handleUpdate({ labels: labelObjects });
              }}
              workspaceId={workspaceId}
              disabled={isUpdating}
            />

            {/* Project Selector */}
            <IssueProjectSelector
              value={issue.projectId}
              onChange={(value) => handleUpdate({ projectId: value })}
              workspaceId={workspaceId || ''}
              disabled={isUpdating}
            />

            {/* Due Date Selector */}
            <IssueDateSelector
              value={issue.dueDate}
              onChange={(value) => handleUpdate({ dueDate: value })}
              disabled={isUpdating}
            />
          </div>

          {/* Created info */}
          <div className="flex items-center gap-2 text-xs text-[#6e7681]">
            <span>Created {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}</span>
            {issue.reporter && (
              <>
                <span>by</span>
                <div className="flex items-center gap-1">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={issue.reporter.image} />
                    <AvatarFallback className="text-[10px] bg-[#333] text-[#8b949e]">
                      {issue.reporter.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{issue.reporter.name}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Full Width Notion-like Experience */}
      <div className={cn(
        "flex-1",
        mode === 'modal' ? "overflow-y-auto" : "overflow-visible"
      )}>
        <div className="space-y-6 pb-8">
                  {/* Seamless Description Editor - Full Width */}
        <div className="w-full relative">
          {/* Save Changes Button - Positioned at top right of editor */}
          {descriptionHasChanges && (
            <div className="absolute top-3 right-3 z-50 flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border border-[#21262d] rounded-md shadow-sm">
              <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                <div className="h-1.5 w-1.5 bg-orange-400 rounded-full" />
                <span>Unsaved</span>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDescription(issue?.description || '');
                    setDescriptionHasChanges(false);
                  }}
                  disabled={isDescriptionSaving}
                  className="h-6 px-2 text-xs text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] pointer-events-auto"
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveDescription}
                  disabled={isDescriptionSaving}
                  className="h-6 px-2 text-xs bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] pointer-events-auto"
                >
                                     {isDescriptionSaving ? (
                     <Loader2 className="h-3 w-3 animate-spin" />
                   ) : (
                     <div className="flex items-center gap-2">
                       <span className="text-xs">Save</span>
                       <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#161b22] border border-[#30363d] rounded text-[10px] text-[#8b949e]">
                         {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? (
                           <>
                             <Command className="h-2.5 w-2.5" />
                             <span>S</span>
                           </>
                         ) : (
                           <span className="font-mono">Ctrl+S</span>
                         )}
                       </div>
                     </div>
                   )}
                </Button>
              </div>
            </div>
          )}
          
          <IssueDescriptionEditor
            value={description}
            onChange={handleDescriptionChange}
            placeholder="Add a description..."
            onAiImprove={handleAiImprove}
            className="min-h-[400px] w-full"
          />
        </div>



          {/* Issue Tabs Section - Relations, Sub-issues, Time, Team, Activity, Comments */}
          <IssueTabs
            issue={issue}
            initialComments={issue.comments || []}
            currentUserId={workspaceId || ""} // TODO: Replace with actual current user ID
            workspaceId={workspaceId || ""}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  );
} 
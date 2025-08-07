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
  Calendar as CalendarIcon,
  MessageSquare,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Archive,
  Star,
  Eye,
  Clock,
  ArrowRight,
  User,
  Circle,
  ChevronDown,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownContent } from "@/components/ui/markdown-content";

// Import types
import type { Issue, IssueDetailProps, IssueFieldUpdate } from "@/types/issue";

// Helper functions for styling (matching KanbanIssueCard)
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

const getPriorityColor = (priority: string) => {
  const colors = {
    'URGENT': '#ef4444',
    'HIGH': '#f97316', 
    'MEDIUM': '#eab308',
    'LOW': '#22c55e'
  };
  return colors[priority as keyof typeof colors] || '#6b7280';
};

const getStatusColor = (status: string) => {
  const colors = {
    'TODO': '#6b7280',
    'IN_PROGRESS': '#3b82f6',
    'IN_REVIEW': '#f59e0b',
    'DONE': '#10b981',
    'CANCELLED': '#ef4444'
  };
  return colors[status as keyof typeof colors] || '#6b7280';
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
  const [editingDescription, setEditingDescription] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();

  // Initialize local state from issue data
  useEffect(() => {
    if (issue) {
      setTitle(issue.title || '');
      setDescription(issue.description || '');
    }
  }, [issue]);

  // Handle field updates with optimistic UI
  const handleUpdate = useCallback(async (updates: IssueFieldUpdate) => {
    if (!issue) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update issue');
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
    try {
      await handleUpdate({ description });
      setEditingDescription(false);
    } catch (error) {
      // Error already handled in handleUpdate
    }
  }, [description, handleUpdate]);

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
            if (!editingTitle && !editingDescription) {
              event.preventDefault();
              handleCopyLink();
            }
            break;
          case 'Enter':
            if (editingTitle) {
              event.preventDefault();
              handleSaveTitle();
            } else if (editingDescription) {
              event.preventDefault();
              handleSaveDescription();
            }
            break;
        }
      }
      
      if (event.key === 'Escape') {
        if (editingTitle) {
          setEditingTitle(false);
          setTitle(issue?.title || '');
        } else if (editingDescription) {
          setEditingDescription(false);
          setDescription(issue?.description || '');
        } else if (mode === 'modal') {
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingTitle, editingDescription, handleSaveTitle, handleSaveDescription, handleCopyLink, issue, mode, onClose]);

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
      "h-full flex flex-col",
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

          {/* Properties Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Badge */}
            <Select
              value={issue.status}
              onValueChange={(value) => handleUpdate({ status: value })}
            >
              <SelectTrigger className="h-6 w-auto min-w-0 border-0 bg-transparent p-0 focus:ring-0">
                <Badge 
                  className="h-5 px-2 text-xs font-medium border-0 rounded-sm cursor-pointer"
                  style={{ 
                    backgroundColor: getStatusColor(issue.status || 'TODO') + '25',
                    color: getStatusColor(issue.status || 'TODO')
                  }}
                >
                  {issue.status?.replace('_', ' ')}
                  <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              </SelectTrigger>
              <SelectContent className="bg-[#1f1f1f] border-[#333]">
                <SelectItem value="TODO" className="text-[#8b949e] hover:text-white">Todo</SelectItem>
                <SelectItem value="IN_PROGRESS" className="text-[#8b949e] hover:text-white">In Progress</SelectItem>
                <SelectItem value="IN_REVIEW" className="text-[#8b949e] hover:text-white">In Review</SelectItem>
                <SelectItem value="DONE" className="text-[#8b949e] hover:text-white">Done</SelectItem>
              </SelectContent>
            </Select>

            {/* Priority Badge */}
            {issue.priority && issue.priority !== 'MEDIUM' && (
              <Select
                value={issue.priority}
                onValueChange={(value) => handleUpdate({ priority: value as any })}
              >
                <SelectTrigger className="h-6 w-auto min-w-0 border-0 bg-transparent p-0 focus:ring-0">
                  <Badge 
                    className="h-5 px-2 text-xs font-medium border-0 rounded-sm cursor-pointer"
                    style={{ 
                      backgroundColor: getPriorityColor(issue.priority) + '25',
                      color: getPriorityColor(issue.priority)
                    }}
                  >
                    {issue.priority}
                    <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                  </Badge>
                </SelectTrigger>
                <SelectContent className="bg-[#1f1f1f] border-[#333]">
                  <SelectItem value="LOW" className="text-[#8b949e] hover:text-white">Low</SelectItem>
                  <SelectItem value="MEDIUM" className="text-[#8b949e] hover:text-white">Medium</SelectItem>
                  <SelectItem value="HIGH" className="text-[#8b949e] hover:text-white">High</SelectItem>
                  <SelectItem value="URGENT" className="text-[#8b949e] hover:text-white">Urgent</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Assignee */}
            {issue.assignee && (
              <div className="flex items-center gap-1 bg-[#1f1f1f] hover:bg-[#333] px-2 py-1 rounded-sm cursor-pointer transition-colors">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={issue.assignee.image} />
                  <AvatarFallback className="text-[10px] bg-[#333] text-[#8b949e]">
                    {issue.assignee.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-[#8b949e]">{issue.assignee.name}</span>
              </div>
            )}

            {/* Labels */}
            {issue.labels && issue.labels.length > 0 && (
              <>
                {issue.labels.slice(0, 3).map((label: any) => (
                  <Badge 
                    key={label.id}
                    className="h-5 px-2 text-xs font-medium border-0 rounded-sm cursor-pointer"
                    style={{ 
                      backgroundColor: label.color + '25',
                      color: label.color || '#8b949e'
                    }}
                  >
                    {label.name}
                  </Badge>
                ))}
                {issue.labels.length > 3 && (
                  <span className="text-xs text-[#6e7681] px-1">+{issue.labels.length - 3}</span>
                )}
              </>
            )}

            {/* Due Date */}
            {issue.dueDate && (
              <Popover>
                <PopoverTrigger asChild>
                  <Badge className="h-5 px-2 text-xs font-medium bg-orange-500/20 text-orange-400 border-0 rounded-sm cursor-pointer">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {new Date(issue.dueDate).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </Badge>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#1f1f1f] border-[#333]" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(issue.dueDate)}
                    onSelect={(date) => handleUpdate({ dueDate: date })}
                    className="text-white"
                  />
                </PopoverContent>
              </Popover>
            )}

            {/* Add property button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-xs text-[#6e7681] hover:text-white hover:bg-[#1f1f1f] border border-dashed border-[#333] hover:border-[#58a6ff]"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
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

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className={cn(
          "h-full",
          mode === 'page' ? "grid grid-cols-1 lg:grid-cols-4 gap-6" : "space-y-6"
        )}>
          {/* Description */}
          <div className={cn(mode === 'page' ? "lg:col-span-3" : "")}>
            <div className="space-y-4">
              <div className="border border-[#1f1f1f] rounded-lg bg-[#0a0a0a] hover:border-[#333] transition-colors">
                <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
                  <h3 className="text-sm font-medium text-white">Description</h3>
                  {!editingDescription && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingDescription(true)}
                      className="h-6 w-6 p-0 text-[#6e7681] hover:text-white"
                    >
                      <PenLine className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                
                <div className="p-4">
                  {editingDescription ? (
                    <div className="space-y-3">
                      <MarkdownEditor
                        initialValue={description}
                        onChange={setDescription}
                        placeholder="Add a description..."
                        minHeight="150px"
                        className="bg-[#0a0a0a] border-[#1f1f1f] text-white"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveDescription}
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
                            setEditingDescription(false);
                            setDescription(issue.description || '');
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
                      className="min-h-[100px] cursor-pointer hover:bg-[#1f1f1f]/50 p-2 -m-2 rounded transition-colors"
                      onClick={() => setEditingDescription(true)}
                    >
                      {issue.description ? (
                        <MarkdownContent 
                          content={issue.description} 
                          htmlContent={issue.description}
                          className="prose prose-sm prose-invert max-w-none"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-20 border border-dashed border-[#333] rounded text-[#6e7681]">
                          <div className="text-center">
                            <PenLine className="h-4 w-4 mx-auto mb-1 opacity-60" />
                            <p className="text-xs">Click to add description</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Comments section placeholder */}
              <div className="border border-[#1f1f1f] rounded-lg bg-[#0a0a0a]">
                <div className="p-3 border-b border-[#1f1f1f]">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Comments
                  </h3>
                </div>
                <div className="p-6 text-center text-[#6e7681]">
                  <p className="text-sm">No comments yet</p>
                  <p className="text-xs mt-1">Start a conversation...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar for page mode */}
          {mode === 'page' && (
            <div className="lg:col-span-1">
              <div className="space-y-4">
                {/* Activity/History placeholder */}
                <div className="border border-[#1f1f1f] rounded-lg bg-[#0a0a0a]">
                  <div className="p-3 border-b border-[#1f1f1f]">
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Activity
                    </h3>
                  </div>
                  <div className="p-4 text-center text-[#6e7681]">
                    <p className="text-xs">Activity will appear here</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
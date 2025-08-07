"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  PenLine, 
  Check, 
  X, 
  Copy, 
  Loader2,
  Share,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  getIssueTypeBadge, 
  getIssuePriorityBadge, 
  getIssueStatusBadge,
  formatIssueDate,
  copyToClipboard
} from "@/utils/issueHelpers";
import { Badge } from "@/components/ui/badge";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import type { Issue, IssueUser } from "@/types/issue";

interface IssueHeaderProps {
  issue: Issue;
  onUpdateTitle: (title: string) => Promise<void>;
  onShare?: () => void;
  onOpenExternal?: () => void;
  isUpdating?: boolean;
}

export function IssueHeader({ 
  issue, 
  onUpdateTitle, 
  onShare, 
  onOpenExternal,
  isUpdating = false 
}: IssueHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(issue.title);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Helper function to render badge
  const renderBadge = (badgeConfig: { label: string; icon: any; className: string; iconClassName: string }) => {
    const Icon = badgeConfig.icon;
    return (
      <Badge variant="outline" className={badgeConfig.className}>
        <Icon className={badgeConfig.iconClassName} />
        {badgeConfig.label}
      </Badge>
    );
  };

  const handleTitleClick = useCallback(() => {
    setIsEditingTitle(true);
  }, []);

  const handleTitleSave = useCallback(async () => {
    if (!title.trim()) {
      toast({
        title: "Invalid title",
        description: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (title === issue.title) {
      setIsEditingTitle(false);
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateTitle(title);
      setIsEditingTitle(false);
      toast({
        title: "Updated",
        description: "Issue title updated successfully",
      });
    } catch (error) {
      console.error("Failed to update title:", error);
      toast({
        title: "Error",
        description: "Failed to update title",
        variant: "destructive",
      });
      setTitle(issue.title); // Reset to original
    } finally {
      setIsSaving(false);
    }
  }, [title, issue.title, onUpdateTitle, toast]);

  const handleTitleCancel = useCallback(() => {
    setTitle(issue.title);
    setIsEditingTitle(false);
  }, [issue.title]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      handleTitleCancel();
    }
  }, [handleTitleSave, handleTitleCancel]);

  const handleCopyIssueKey = useCallback(async () => {
    if (!issue.issueKey) return;
    
    const success = await copyToClipboard(issue.issueKey);
    if (success) {
      toast({
        title: "Copied",
        description: `${issue.issueKey} copied to clipboard`,
      });
    } else {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  }, [issue.issueKey, toast]);

  return (
    <div className="space-y-6">
      {/* Issue Key and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {issue.issueKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyIssueKey}
              className={cn(
                "font-mono text-sm font-semibold",
                "bg-gradient-to-r from-muted/40 to-muted/60",
                "border border-border/50",
                "hover:from-muted/60 hover:to-muted/80",
                "hover:border-border/80",
                "transition-all duration-200",
                "text-muted-foreground hover:text-foreground",
                "shadow-sm hover:shadow-md"
              )}
            >
              {issue.issueKey}
              <Copy className="h-3.5 w-3.5 ml-2 opacity-60" />
            </Button>
          )}
          
          <div className="flex items-center gap-2">
            {renderBadge(getIssueTypeBadge(issue.type))}
            {renderBadge(getIssueStatusBadge(issue.status || "Todo"))}
            {renderBadge(getIssuePriorityBadge(issue.priority))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onShare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              className="h-8 w-8 p-0"
            >
              <Share className="h-4 w-4" />
            </Button>
          )}
          {onOpenExternal && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenExternal}
              className="h-8 w-8 p-0"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Title Section */}
      <div className="space-y-4">
        {isEditingTitle ? (
          <div className="space-y-3">
            <div className="relative">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "text-3xl font-bold py-3 px-4 h-auto",
                  "border-2 border-primary/20 focus-visible:border-primary/40",
                  "bg-background/50 backdrop-blur-sm",
                  "transition-all duration-200"
                )}
                placeholder="Issue title"
                autoFocus
                disabled={isSaving}
              />
              {isSaving && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleTitleSave}
                disabled={isSaving || !title.trim()}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTitleCancel}
                disabled={isSaving}
                className="gap-2"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div 
            className={cn(
              "group relative cursor-pointer rounded-lg p-2 -m-2",
              "hover:bg-muted/30 transition-all duration-200",
              isUpdating && "opacity-60 pointer-events-none"
            )}
            onClick={handleTitleClick}
          >
            <h1 className={cn(
              "text-3xl font-bold leading-tight",
              "text-foreground group-hover:text-primary",
              "transition-colors duration-200",
              "pr-8"
            )}>
              {issue.title}
            </h1>
            <PenLine className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2",
              "h-4 w-4 opacity-0 group-hover:opacity-60",
              "text-muted-foreground group-hover:text-primary",
              "transition-all duration-200"
            )} />
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Created</span>
            <time className="font-medium">{formatIssueDate(issue.createdAt)}</time>
          </div>
          
          {issue.reporter && (
            <div className="flex items-center gap-2">
              <span>by</span>
              <div className="flex items-center gap-1.5">
                <CustomAvatar user={issue.reporter} size="sm" />
                <span className="font-medium">{issue.reporter.name}</span>
              </div>
            </div>
          )}

          {issue.project && (
            <div className="flex items-center gap-2">
              <span>in</span>
              <span className="font-medium font-mono text-xs px-2 py-1 bg-muted/50 rounded">
                {issue.project.name}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 
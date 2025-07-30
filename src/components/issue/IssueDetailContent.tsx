"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Import our custom components
import { IssueHeader } from "./IssueHeader";
import { IssueDescription } from "./IssueDescription";
import { IssueSidebar } from "./IssueSidebar";

// Import types
import type { Issue, IssueDetailProps, IssueFieldUpdate } from "@/types/issue";

export function IssueDetailContent({
  issue,
  error,
  isLoading = false,
  onRefresh,
  onClose,
  boardId
}: IssueDetailProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  // Handle field updates
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

      // Refresh the issue data
      onRefresh();
    } catch (error) {
      console.error('Failed to update issue:', error);
      throw error; // Re-throw to let individual components handle the error
    } finally {
      setIsUpdating(false);
    }
  }, [issue, onRefresh]);

  // Handle title update
  const handleTitleUpdate = useCallback(async (title: string) => {
    await handleUpdate({ title });
  }, [handleUpdate]);

  // Handle description update  
  const handleDescriptionUpdate = useCallback(async (description: string) => {
    await handleUpdate({ description });
  }, [handleUpdate]);

  // Handle issue deletion
  const handleDelete = useCallback(async () => {
    if (!issue) return;

    const response = await fetch(`/api/issues/${issue.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete issue');
    }

    // Close the issue detail view
    onClose?.();
  }, [issue, onClose]);

  // Handle sharing
  const handleShare = useCallback(() => {
    if (!issue?.issueKey) return;

    const url = `${window.location.origin}/issues/${issue.issueKey}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link copied",
        description: "Issue link has been copied to clipboard",
      });
    }).catch(() => {
      toast({
        title: "Failed to copy",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    });
  }, [issue, toast]);

  // Handle opening in new tab
  const handleOpenExternal = useCallback(() => {
    if (!issue?.issueKey) return;
    
    const url = `/issues/${issue.issueKey}`;
    window.open(url, '_blank');
  }, [issue]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading issue...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <Card className="p-8 border-destructive/20 bg-destructive/5">
          <div className="space-y-4">
            <div className="text-destructive font-semibold">Error</div>
            <p className="text-muted-foreground">{error}</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={onRefresh}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Try Again
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Not found state
  if (!issue) {
    return (
      <div className="text-center py-12">
        <Card className="p-8">
          <div className="space-y-4">
            <div className="text-lg font-semibold">Issue not found</div>
            <p className="text-muted-foreground">
              The issue you're looking for doesn't exist or you don't have permission to view it.
            </p>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn(
      "max-w-7xl mx-auto p-6 space-y-8",
      "transition-opacity duration-200",
      isUpdating && "opacity-60"
    )}>
      {/* Issue Header */}
      <IssueHeader
        issue={issue}
        onUpdateTitle={handleTitleUpdate}
        onShare={handleShare}
        onOpenExternal={handleOpenExternal}
        isUpdating={isUpdating}
      />

      <Separator className="my-8" />

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Content - Description and Comments */}
        <div className="lg:col-span-3 space-y-8">
          <IssueDescription
            issue={issue}
            onUpdateDescription={handleDescriptionUpdate}
            isUpdating={isUpdating}
          />

          {/* Comments and Activity Section */}
          {/* TODO: Add IssueComments component here */}
          <Card className={cn(
            "border-border/50 shadow-sm",
            "bg-gradient-to-br from-background/80 to-muted/20",
            "backdrop-blur-sm"
          )}>
            <div className="p-6">
              <h3 className="font-semibold text-lg mb-4">Comments & Activity</h3>
              <div className="text-center py-8 text-muted-foreground">
                <p>Comments and activity will be shown here</p>
                <p className="text-sm mt-2">Feature coming soon...</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Sidebar - Issue Properties */}
        <div className="lg:col-span-1">
          <IssueSidebar
            issue={issue}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isUpdating={isUpdating}
          />
        </div>
      </div>
    </div>
  );
} 
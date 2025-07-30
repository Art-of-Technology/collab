"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { IssueDetailContent } from "./IssueDetailContent";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { Issue, IssueModalProps } from "@/types/issue";

export function IssueDetailModal({ issueId, onClose }: IssueModalProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { currentWorkspace } = useWorkspace();

  // Fetch issue data
  const fetchIssue = async () => {
    if (!issueId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/issues/${issueId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Issue not found");
        } else if (response.status === 403) {
          throw new Error("You don't have permission to view this issue");
        } else {
          throw new Error(`Failed to load issue (${response.status})`);
        }
      }

      const data = await response.json();
      setIssue(data.issue || data);
      setIsOpen(true);
    } catch (err) {
      console.error("Failed to fetch issue:", err);
      setError(err instanceof Error ? err.message : "Failed to load issue. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh issue data
  const handleRefresh = () => {
    fetchIssue();
  };

  // Open modal when issueId is provided
  useEffect(() => {
    if (issueId) {
      fetchIssue();
    } else {
      setIsOpen(false);
      setIssue(null);
      setError(null);
    }
  }, [issueId]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsOpen(false);
      onClose();
    }
  };

  const handleOpenExternal = () => {
    if (!issue?.issueKey) return;
    
    const url = currentWorkspace?.slug 
      ? `/${currentWorkspace.slug}/issues/${issue.issueKey}`
      : `/issues/${issue.issueKey}`;
    
    window.open(url, '_blank');
  };

  if (!issueId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={`
        max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw]
        max-h-[95vh] 
        overflow-hidden flex flex-col
        p-0
      `}>
        <DialogHeader className={`
          sticky top-0 z-10 
          bg-background/95 backdrop-blur-sm
          border-b border-border/50
          px-6 py-4
          flex-shrink-0
        `}>
          <DialogTitle className="sr-only">
            {issue ? `${issue.issueKey} - ${issue.title}` : "Issue Details"}
          </DialogTitle>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {issue && (
                <>
                  <span className="font-mono text-sm font-semibold text-muted-foreground">
                    {issue.issueKey}
                  </span>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
                    {issue.title}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {issue && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleOpenExternal}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">View Full</span>
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClose} 
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <IssueDetailContent
            issue={issue}
            error={error}
            isLoading={isLoading}
            onRefresh={handleRefresh}
            onClose={onClose}
            boardId={issue?.project?.id}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 
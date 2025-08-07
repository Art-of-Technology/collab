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
        bg-[#0a0a0a] border-[#1f1f1f]
      `}>
        <DialogHeader className="sr-only">
          <DialogTitle>
            {issue ? `${issue.issueKey} - ${issue.title}` : "Issue Details"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 bg-[#0a0a0a]">
          <IssueDetailContent
            issue={issue}
            error={error}
            isLoading={isLoading}
            onRefresh={handleRefresh}
            onClose={onClose}
            boardId={issue?.project?.id}
            mode="modal"
            workspaceId={currentWorkspace?.slug || currentWorkspace?.id}
            issueId={issueId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 
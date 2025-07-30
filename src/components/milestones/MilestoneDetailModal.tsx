"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { MilestoneDetailContent } from "@/components/milestones/MilestoneDetailContent";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { resolveIdToIssueKey } from '@/lib/client-issue-key-resolvers';

interface MilestoneDetailModalProps {
  milestoneId: string | null;
  onClose: () => void;
}

export default function MilestoneDetailModal({ milestoneId, onClose }: MilestoneDetailModalProps) {
  const [milestone, setMilestone] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [milestoneIssueKey, setMilestoneIssueKey] = useState<string | null>(null);
  
  // Get current board ID from TasksContext
  const { selectedBoardId } = useTasks();
  const { currentWorkspace } = useWorkspace();
  
  // For tracking when to refresh milestone details 
  const [shouldRefresh, setShouldRefresh] = useState<boolean>(false);

  const fetchMilestoneDetails = useCallback(async () => {
    if (!milestoneId) return;
    
    setError(null);
    
    try {
      const response = await fetch(`/api/milestones/${milestoneId}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setMilestone(data);
      // Only open modal after data is successfully loaded
      setIsOpen(true);
      
      // Resolve milestone ID to issue key for the View Full URL
      if (milestoneId) {
        resolveIdToIssueKey(milestoneId, 'milestone').then(issueKey => {
          setMilestoneIssueKey(issueKey);
        });
      }
    } catch (err) {
      console.error("Failed to fetch milestone details:", err);
      setError("Failed to load milestone details. Please try again.");
    } finally {
      setShouldRefresh(false);
    }
  }, [milestoneId]);

  // Initial fetch and when milestoneId changes
  useEffect(() => {
    if (milestoneId) {
      fetchMilestoneDetails();
    } else {
      setIsOpen(false);
    }
  }, [fetchMilestoneDetails, milestoneId]);
  
  // Listen for milestone updates
  useEffect(() => {
    if (shouldRefresh) {
      fetchMilestoneDetails();
    }
  }, [shouldRefresh, fetchMilestoneDetails]);
  
  // Function to refresh milestone details
  const refreshMilestoneDetails = () => {
    setShouldRefresh(true);
  };

  if (!milestoneId) return null;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsOpen(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle className="sr-only">Milestone Details</DialogTitle>
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link 
                href={
                  currentWorkspace?.slug && milestoneIssueKey 
                    ? `/${currentWorkspace.slug}/milestones/${milestoneIssueKey}`
                    : currentWorkspace 
                    ? `/${currentWorkspace.id}/milestones/${milestoneId}` 
                    : "#"
                } 
                target="_blank" 
                className="flex items-center gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View Full</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <MilestoneDetailContent
            milestone={milestone}
            error={error}
            onRefresh={refreshMilestoneDetails}
            onClose={onClose}
            boardId={selectedBoardId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 
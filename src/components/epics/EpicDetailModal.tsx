"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { EpicDetailContent } from "@/components/epics/EpicDetailContent";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { resolveIdToIssueKey } from '@/lib/client-issue-key-resolvers';

interface EpicDetailModalProps {
  epicId: string | null;
  onClose: () => void;
}

export default function EpicDetailModal({ epicId, onClose }: EpicDetailModalProps) {
  const [epic, setEpic] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [epicIssueKey, setEpicIssueKey] = useState<string | null>(null);
  
  // Get current board ID from TasksContext
  const { selectedBoardId } = useTasks();
  const { currentWorkspace } = useWorkspace();
  
  // For tracking when to refresh epic details 
  const [shouldRefresh, setShouldRefresh] = useState<boolean>(false);

  const fetchEpicDetails = useCallback(async () => {
    if (!epicId) return;
    
    setError(null);
    
    try {
      const response = await fetch(`/api/epics/${epicId}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setEpic(data);
      // Only open modal after data is successfully loaded
      setIsOpen(true);
      
      // Resolve epic ID to issue key for the View Full URL
      if (epicId) {
        resolveIdToIssueKey(epicId, 'epic').then(issueKey => {
          setEpicIssueKey(issueKey);
        });
      }
    } catch (err) {
      console.error("Failed to fetch epic details:", err);
      setError("Failed to load epic details. Please try again.");
    } finally {
      setShouldRefresh(false);
    }
  }, [epicId]);

  // Initial fetch and when epicId changes
  useEffect(() => {
    if (epicId) {
      fetchEpicDetails();
    } else {
      setIsOpen(false);
    }
  }, [fetchEpicDetails, epicId]);
  
  // Listen for epic updates
  useEffect(() => {
    if (shouldRefresh) {
      fetchEpicDetails();
    }
  }, [shouldRefresh, fetchEpicDetails]);
  
  // Function to refresh epic details
  const refreshEpicDetails = () => {
    setShouldRefresh(true);
  };

  if (!epicId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle className="sr-only">Epic Details</DialogTitle>
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link 
                href={
                  currentWorkspace?.slug && epicIssueKey 
                    ? `/${currentWorkspace.slug}/epics/${epicIssueKey}`
                    : currentWorkspace 
                    ? `/${currentWorkspace.id}/epics/${epicId}` 
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
          <EpicDetailContent
            epic={epic}
            error={error}
            onRefresh={refreshEpicDetails}
            onClose={onClose}
            boardId={selectedBoardId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 
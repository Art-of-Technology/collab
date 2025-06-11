"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { StoryDetailContent } from "@/components/stories/StoryDetailContent";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";

interface StoryDetailModalProps {
  storyId: string | null;
  onClose: () => void;
}

export default function StoryDetailModal({ storyId, onClose }: StoryDetailModalProps) {
  const [story, setStory] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  
  // Get current board ID from TasksContext
  const { selectedBoardId } = useTasks();
  const { currentWorkspace } = useWorkspace();
  
  // For tracking when to refresh story details 
  const [shouldRefresh, setShouldRefresh] = useState<boolean>(false);

  const fetchStoryDetails = useCallback(async (showLoading = true) => {
    if (!storyId) return;
    
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const response = await fetch(`/api/stories/${storyId}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setStory(data);
      // Only open modal after data is successfully loaded
      if (showLoading) {
        setIsOpen(true);
      }
    } catch (err) {
      console.error("Failed to fetch story details:", err);
      setError("Failed to load story details. Please try again.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      setShouldRefresh(false);
    }
  }, [storyId]);

  // Initial fetch and when storyId changes
  useEffect(() => {
    if (storyId) {
      fetchStoryDetails();
    } else {
      setIsOpen(false);
    }
  }, [fetchStoryDetails, storyId]);
  
  // Listen for story updates
  useEffect(() => {
    if (shouldRefresh) {
      fetchStoryDetails(false); // Don't show loading when refreshing
    }
  }, [shouldRefresh, fetchStoryDetails]);
  
  // Function to refresh story details
  const refreshStoryDetails = () => {
    setShouldRefresh(true);
  };

  if (!storyId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle className="sr-only">Story Details</DialogTitle>
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link href={currentWorkspace ? `/${currentWorkspace.id}/stories/${storyId}` : "#"} target="_blank" className="flex items-center gap-1">
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
          <StoryDetailContent
            story={story}
            isLoading={loading}
            error={error}
            onRefresh={refreshStoryDetails}
            onClose={onClose}
            boardId={selectedBoardId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 
"use client";

import { useState, useEffect } from "react";
import { StoryDetailContent } from "@/components/stories/StoryDetailContent";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function StoryPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const [story, setStory] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Resolve params first
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setStoryId(resolvedParams.id);
      setWorkspaceId(resolvedParams.workspaceId);
    };
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!storyId) return;

    const fetchStory = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/stories/${storyId}`);
        
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        
        const data = await response.json();
        setStory(data);
      } catch (err) {
        console.error("Failed to fetch story:", err);
        setError("Failed to load story details. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchStory();
  }, [storyId]);

  const handleRefresh = () => {
    if (storyId) {
      setIsLoading(true);
      fetch(`/api/stories/${storyId}`)
        .then(response => {
          if (!response.ok) throw new Error("Failed to refresh");
          return response.json();
        })
        .then(data => setStory(data))
        .catch(err => {
          console.error("Error refreshing story:", err);
          // Don't set error state on refresh failure to keep showing content
        })
        .finally(() => setIsLoading(false));
    }
  };

  const boardId = story?.taskBoardId || '';
  const backUrl = workspaceId ? `/${workspaceId}/tasks${boardId ? `?board=${boardId}` : ''}` : '#';

  return (
    <div className="container py-6 max-w-7xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="flex items-center justify-start w-max gap-1 text-muted-foreground hover:text-foreground">
          <Link href={backUrl}>
            <ChevronLeft className="h-4 w-4" />
            Back to Board
          </Link>
        </Button>
      </div>
      
      <StoryDetailContent
        story={story}
        isLoading={isLoading}
        error={error}
        onRefresh={handleRefresh}
      />
    </div>
  );
} 
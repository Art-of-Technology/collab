"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceStories, useWorkspaceEpics } from "@/hooks/queries/useEntityDetails";
import { useWorkspace } from "@/context/WorkspaceContext";
import { BookOpen } from 'lucide-react';

interface StorySelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  workspaceId?: string;
  boardId?: string | null;
  epicId?: string | null;
}

export function StorySelect({ value, onChange, disabled, workspaceId, boardId, epicId }: StorySelectProps) {
  const { currentWorkspace } = useWorkspace();
  const wsId = workspaceId || currentWorkspace?.id;
  
  const { data: allStories = [], isLoading } = useWorkspaceStories(wsId, boardId);
  
  // Filter stories based on the selected epic
  const stories = React.useMemo(() => {
    if (!epicId) return allStories;
    return allStories.filter(story => story.epicId === epicId);
  }, [allStories, epicId]);

  const isDisabled = disabled || !boardId || isLoading;
  
  const placeholder = React.useMemo(() => {
    if (!boardId) return "Select board first";
    if (epicId && stories.length === 0) return "No stories in this epic";
    return "Select story...";
  }, [boardId, epicId, stories.length]);

  return (
    <Select 
      value={value || undefined} 
      onValueChange={(val) => onChange(val === 'none' ? null : val)} 
      disabled={isDisabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No Story</SelectItem>
        {isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
        {!isLoading && stories.length === 0 && boardId && 
          <SelectItem value="no-stories" disabled>
            {epicId ? "No stories in this epic" : "No stories on this board"}
          </SelectItem>
        }
        {stories.map((story) => (
          <SelectItem key={story.id} value={story.id}>
             <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-500" />
                {story.title}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 
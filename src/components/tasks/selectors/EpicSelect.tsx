"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceEpics } from "@/hooks/queries/useEntityDetails";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Star } from 'lucide-react';

interface Epic {
    id: string;
    title: string;
    taskBoardId?: string | null;
}

interface EpicSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  workspaceId?: string;
  boardId?: string | null;
  epics?: Epic[];
}

export function EpicSelect({ value, onChange, disabled, workspaceId, boardId, epics: propEpics }: EpicSelectProps) {
  const { currentWorkspace } = useWorkspace();
  const wsId = workspaceId || currentWorkspace?.id;
  
  const { data: fetchedEpics = [], isLoading: isLoadingFetch } = useWorkspaceEpics(
      wsId, 
      boardId, 
  );

  const epicsToDisplay = propEpics || fetchedEpics;
  const isLoading = !propEpics && isLoadingFetch;
  const isDisabled = disabled || !boardId || isLoading;

  return (
    <Select 
      value={value || undefined} 
      onValueChange={(val) => onChange(val === 'none' ? null : val)} 
      disabled={isDisabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={!boardId ? "Select board first" : "Select epic..."} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No Epic</SelectItem>
        {isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
        {!isLoading && epicsToDisplay.length === 0 && boardId && <SelectItem value="no-epics" disabled>No epics on this board</SelectItem>}
        {epicsToDisplay.map((epic) => (
          <SelectItem key={epic.id} value={epic.id}>
             <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-purple-500" />
                {epic.title}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 
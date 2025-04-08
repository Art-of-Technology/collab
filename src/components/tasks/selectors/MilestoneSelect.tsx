"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceMilestones } from "@/hooks/queries/useEntityDetails";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Calendar } from 'lucide-react';

interface MilestoneSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  workspaceId?: string;
  boardId?: string | null;
}

export function MilestoneSelect({ value, onChange, disabled, workspaceId, boardId }: MilestoneSelectProps) {
  const { currentWorkspace } = useWorkspace();
  const wsId = workspaceId || currentWorkspace?.id;
  
  const { data: milestones = [], isLoading } = useWorkspaceMilestones(wsId, boardId, {
      enabled: !!wsId 
  });

  const isDisabled = disabled || !boardId || isLoading;

  return (
    <Select 
      value={value || undefined} 
      onValueChange={(val) => onChange(val === 'none' ? null : val)} 
      disabled={isDisabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={!boardId ? "Select board first" : "Select milestone..."} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No Milestone</SelectItem>
        {isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
        {!isLoading && milestones.length === 0 && boardId && <SelectItem value="no-milestones" disabled>No milestones on this board</SelectItem>}
        {milestones.map((milestone) => (
          <SelectItem key={milestone.id} value={milestone.id}>
            <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500" />
                {milestone.title}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 
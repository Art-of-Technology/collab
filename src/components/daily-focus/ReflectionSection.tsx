"use client";

import { useState } from 'react';
import { DailyFocusReflection, ReflectionStatus } from '@/hooks/queries/useDailyFocus';
import { IssueStatusBadge } from './IssueStatusBadge';
import { IssueSearchSelector } from './IssueSearchSelector';
import { getStatusConfig, groupReflectionsByStatus } from '@/utils/dailyFocusHelpers';
import { Plus, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ReflectionSectionProps {
  reflections: DailyFocusReflection[];
  issues?: any[];
  workspaceId: string;
  workspaceSlug?: string;
  projectIds?: string[];
  isReadOnly?: boolean;
  onAddReflection?: (issueId: string) => void;
  onRemoveReflection?: (reflectionId: string) => void;
  onUpdateStatus?: (reflectionId: string, status: ReflectionStatus) => void;
  onUpdateNotes?: (reflectionId: string, notes: string) => void;
}

export function ReflectionSection({
  reflections,
  issues = [],
  workspaceId,
  workspaceSlug,
  projectIds,
  isReadOnly = false,
  onAddReflection,
  onRemoveReflection,
  onUpdateStatus,
  onUpdateNotes,
}: ReflectionSectionProps) {
  const [showAddIssue, setShowAddIssue] = useState(false);
  const groupedReflections = groupReflectionsByStatus(reflections);
  const selectedIssueIds = reflections.map(r => r.issueId);

  const handleStatusClick = (reflection: DailyFocusReflection) => {
    if (isReadOnly || !onUpdateStatus) return;
    
    const statuses: ReflectionStatus[] = [
      'COMPLETED',
      'COULD_NOT_COMPLETE',
      'PAUSED',
      'PENDING_INPUT',
      'UNPLANNED_WORK',
      'UNTOUCHED',
    ];
    const currentIndex = statuses.indexOf(reflection.status);
    const nextIndex = (currentIndex + 1) % statuses.length;
    onUpdateStatus(reflection.id, statuses[nextIndex]);
  };

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f] border-r border-[#1a1a1a]">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white text-sm font-medium">Yesterday's Reflection</h3>
          {!isReadOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddIssue(!showAddIssue)}
              className="h-6 px-2 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Issue
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>✅ {groupedReflections.COMPLETED.length} completed</span>
          <span>🕒 {groupedReflections.PAUSED.length} paused</span>
          <span>⚡️ {groupedReflections.UNPLANNED_WORK.length} unplanned</span>
        </div>
      </div>

      {/* Add Issue Selector */}
      {showAddIssue && !isReadOnly && (
        <div className="p-4 border-b border-[#1a1a1a] bg-[#0a0a0a]">
          <IssueSearchSelector
            workspaceId={workspaceId}
            projectIds={projectIds}
            selectedIssueIds={selectedIssueIds}
            onSelectIssue={(issueId) => {
              onAddReflection?.(issueId);
              setShowAddIssue(false);
            }}
            placeholder="Search and select issue..."
          />
        </div>
      )}

      {/* Reflections List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(groupedReflections).map(([status, statusReflections]) => {
          if (statusReflections.length === 0) return null;
          
          const config = getStatusConfig(status as ReflectionStatus);
          
          return (
            <div key={status} className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                <config.icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                <span>{config.label}</span>
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {statusReflections.length}
                </Badge>
              </div>
              
              <div className="space-y-1 ml-6">
                {statusReflections.map((reflection) => (
                  <div
                    key={reflection.id}
                    className={cn(
                      "group p-2 rounded bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors",
                      isReadOnly && "cursor-default"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/${workspaceSlug}/issues/${reflection.issue?.issueKey || reflection.issueId}`}
                            className="text-white text-sm font-medium hover:text-blue-400 truncate"
                          >
                            {reflection.issue?.title || `Issue ${reflection.issueId}`}
                          </Link>
                        </div>
                        {reflection.issue?.project && (
                          <div className="text-xs text-gray-500 mb-1">
                            {reflection.issue.project.name}
                          </div>
                        )}
                        {reflection.notes && (
                          <div className="text-xs text-gray-400 mt-1">
                            {reflection.notes}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {!isReadOnly && (
                          <>
                            <button
                              onClick={() => handleStatusClick(reflection)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <IssueStatusBadge status={reflection.status} variant="compact" />
                            </button>
                            <button
                              onClick={() => onRemoveReflection?.(reflection.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {isReadOnly && (
                          <IssueStatusBadge status={reflection.status} variant="compact" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        
        {reflections.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            No reflections yet. Add issues you worked on yesterday.
          </div>
        )}
      </div>
    </div>
  );
}


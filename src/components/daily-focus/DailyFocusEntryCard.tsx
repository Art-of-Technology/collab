"use client";

import { DailyFocusEntry } from '@/hooks/queries/useDailyFocus';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { IssueStatusBadge } from './IssueStatusBadge';
import { getRelativeDateLabel, groupReflectionsByStatus } from '@/utils/dailyFocusHelpers';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface DailyFocusEntryCardProps {
  entry: DailyFocusEntry;
  workspaceSlug?: string;
}

export function DailyFocusEntryCard({ entry, workspaceSlug }: DailyFocusEntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const groupedReflections = groupReflectionsByStatus(entry.reflections || []);

  const completedCount = groupedReflections.COMPLETED.length;
  const pausedCount = groupedReflections.PAUSED.length;
  const plannedCount = entry.plans?.length || 0;

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={entry.user?.image} />
            <AvatarFallback className="bg-[#2a2a2a] text-white text-xs">
              {entry.user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-white text-sm font-medium">
              {entry.user?.name || 'Unknown User'}
            </div>
            <div className="text-gray-400 text-xs">
              {getRelativeDateLabel(entry.date)}
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <div className="text-green-400">
          ✅ {completedCount} completed
        </div>
        {pausedCount > 0 && (
          <div className="text-yellow-400">
            🕒 {pausedCount} paused
          </div>
        )}
        <div className="text-blue-400">
          📋 {plannedCount} planned
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 pt-4 border-t border-[#2a2a2a]">
          {/* Reflections */}
          {entry.reflections && entry.reflections.length > 0 && (
            <div>
              <h4 className="text-white text-sm font-medium mb-2">Yesterday's Work</h4>
              <div className="space-y-2">
                {Object.entries(groupedReflections).map(([status, reflections]) => {
                  if (reflections.length === 0) return null;
                  return (
                    <div key={status} className="space-y-1">
                      {reflections.map((reflection) => (
                        <div
                          key={reflection.id}
                          className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded"
                        >
                          <IssueStatusBadge status={status as any} variant="compact" />
                          <Link
                            href={`/${workspaceSlug}/issues/${reflection.issue?.issueKey || reflection.issueId}`}
                            className="text-gray-300 text-sm hover:text-white flex-1 truncate"
                          >
                            {reflection.issue?.title || 'Unknown Issue'}
                          </Link>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plans */}
          {entry.plans && entry.plans.length > 0 && (
            <div>
              <h4 className="text-white text-sm font-medium mb-2">Today's Plan</h4>
              <div className="space-y-1">
                {entry.plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded"
                  >
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <Link
                      href={`/${workspaceSlug}/issues/${plan.issue?.issueKey || plan.issueId}`}
                      className="text-gray-300 text-sm hover:text-white flex-1 truncate"
                    >
                      {plan.issue?.title || 'Unknown Issue'}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



"use client";

import { useState } from 'react';
import { useTeamDailyFocus, TeamDailyFocusFilters } from '@/hooks/queries/useDailyFocus';
import { DailyFocusEntryCard } from './DailyFocusEntryCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Filter } from 'lucide-react';
import { formatDate } from '@/utils/dailyFocusHelpers';

interface TeamOverviewProps {
  workspaceId: string;
  workspaceSlug?: string;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onBack: () => void;
}

export function TeamOverview({
  workspaceId,
  workspaceSlug,
  selectedDate,
  onDateChange,
  onBack,
}: TeamOverviewProps) {
  const [filters, setFilters] = useState<TeamDailyFocusFilters>({
    startDate: selectedDate.toISOString().split('T')[0],
    endDate: selectedDate.toISOString().split('T')[0],
  });

  const { data, isLoading } = useTeamDailyFocus(workspaceId, filters);

  const entries = data?.entries || [];
  const stats = data?.stats || {
    totalEntries: 0,
    totalCompleted: 0,
    totalOngoing: 0,
    totalPlanned: 0,
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a] bg-[#0f0f0f]">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-7 px-2 text-xs"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back
          </Button>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={filters.startDate || selectedDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const date = e.target.value;
                setFilters({ ...filters, startDate: date, endDate: date });
              }}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>👥 {stats.totalEntries} people</span>
          <span>✅ {stats.totalCompleted} completed</span>
          <span>🕒 {stats.totalOngoing} ongoing</span>
          <span>📋 {stats.totalPlanned} planned</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading team updates...</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-gray-400 mb-2">No submissions yet</div>
            <div className="text-gray-500 text-sm">
              Team members haven't submitted their daily focus for this date.
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {entries.map((entry) => (
              <DailyFocusEntryCard
                key={entry.id}
                entry={entry}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



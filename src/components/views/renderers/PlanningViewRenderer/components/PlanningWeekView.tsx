"use client";

import { useMemo, useState, useRef } from 'react';
import { eachDayOfInterval } from 'date-fns';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import type { TeamMemberRangeSync } from '../types';
import { 
  WeekViewMinimap, 
  WeekViewHeader, 
  WeekViewMemberRow 
} from './week-view';

// ============================================================================
// Props
// ============================================================================

interface PlanningWeekViewProps {
  members: TeamMemberRangeSync[];
  workspaceSlug: string;
  dateRange: { startDate: Date; endDate: Date };
}

// ============================================================================
// Constants
// ============================================================================

const MEMBER_COLUMN_WIDTH = 224;
const DAY_COLUMN_WIDTH = 280;

// ============================================================================
// Main Component
// ============================================================================

export function PlanningWeekView({
  members,
  workspaceSlug,
  dateRange,
}: PlanningWeekViewProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(() => 
    new Set(members.map(m => m.userId))
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Calculate days in range
  const days = useMemo(() => {
    return eachDayOfInterval({
      start: dateRange.startDate,
      end: dateRange.endDate,
    });
  }, [dateRange]);

  // Sort members alphabetically
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => a.userName.localeCompare(b.userName));
  }, [members]);

  // Toggle member expansion
  const toggleMember = (userId: string) => {
    const next = new Set(expandedMembers);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setExpandedMembers(next);
  };

  // Empty state
  if (members.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#3f3f46] text-[13px]">No team activity found</div>
          <div className="text-[#52525b] text-[12px] mt-1">
            There are no team members with activity in this period
          </div>
        </div>
      </div>
    );
  }

  // Calculate minimum table width
  const minTableWidth = MEMBER_COLUMN_WIDTH + (days.length * DAY_COLUMN_WIDTH);

  return (
    <>
      <div className="flex-1 relative overflow-hidden">
        {/* Table container */}
        <div 
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-auto"
        >
          <table 
            className="border-collapse"
            style={{ minWidth: `${minTableWidth}px`, width: '100%' }}
          >
            {/* Header */}
            <WeekViewHeader days={days} />

            {/* Body */}
            <tbody>
              {sortedMembers.map((member) => (
                <WeekViewMemberRow
                  key={member.userId}
                  member={member}
                  days={days}
                  isExpanded={expandedMembers.has(member.userId)}
                  onToggle={() => toggleMember(member.userId)}
                  onOpenModal={setSelectedIssueId}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Floating minimap */}
        <WeekViewMinimap 
          scrollContainerRef={scrollContainerRef}
          days={days}
        />
      </div>

      {/* Issue Detail Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </>
  );
}

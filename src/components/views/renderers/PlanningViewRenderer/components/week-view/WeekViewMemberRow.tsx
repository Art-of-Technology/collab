"use client";

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isFuture, startOfDay } from 'date-fns';
import type { TeamMemberRangeSync } from '../../types';
import { WeekViewDayCell } from './WeekViewDayCell';
import { WeekViewStatBadge } from './WeekViewStatBadge';

interface WeekViewMemberRowProps {
  member: TeamMemberRangeSync;
  days: Date[];
  isExpanded: boolean;
  onToggle: () => void;
  onOpenModal: (issueId: string) => void;
}

export function WeekViewMemberRow({
  member,
  days,
  isExpanded,
  onToggle,
  onOpenModal,
}: WeekViewMemberRowProps) {
  const hasWarnings = member.insights.warnings.length > 0;

  // Calculate totals (only for past and current days, not future)
  let completed = 0;
  let sentToReview = 0;
  let started = 0;
  let blocked = 0;

  Object.entries(member.days).forEach(([dateStr, day]) => {
    const dayDate = new Date(dateStr);
    // Only count days that are not in the future
    if (!isFuture(dayDate)) {
      completed += day.completed.length;
      sentToReview += day.movedToReview?.length || 0;
      started += day.started.length;
      blocked += day.blocked?.length || 0;
    }
  });

  const totals = { completed, sentToReview, started, blocked };

  return (
    <tr className="border-b border-[#27272a]">
      {/* Member cell - sticky left */}
      <td className="min-w-[224px] w-[224px] sticky left-0 z-10 bg-[#09090b] border-r border-[#27272a] align-top">
        <button
          onClick={onToggle}
          className="w-full px-3 py-3 flex items-center gap-3 hover:bg-[#18181b] transition-colors text-left"
        >
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={member.userImage} />
            <AvatarFallback className="bg-[#27272a] text-[#fafafa] text-xs font-medium">
              {member.userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-[#fafafa] truncate">
                {member.userName}
              </span>
              {hasWarnings && (
                <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <WeekViewStatBadge count={totals.completed} label="done" color="emerald" />
              <WeekViewStatBadge count={totals.sentToReview} label="sent" color="purple" />
              <WeekViewStatBadge count={totals.started} label="started" color="blue" />
              <WeekViewStatBadge count={totals.blocked} label="blocked" color="amber" />
            </div>
          </div>
          
          <ChevronRight className={cn(
            "h-4 w-4 text-[#52525b] transition-transform flex-shrink-0",
            isExpanded && "rotate-90"
          )} />
        </button>
      </td>

      {/* Day cells */}
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayActivity = member.days[dateStr];
        const isTodayDay = isToday(day);
        const isFutureDay = isFuture(startOfDay(day));
        
        // Don't show data for future days - we don't know what will happen
        const effectiveActivity = isFutureDay ? undefined : dayActivity;
        
        const totalItems = effectiveActivity 
          ? effectiveActivity.completed.length + (effectiveActivity.movedToReview?.length || 0) + 
            effectiveActivity.started.length + effectiveActivity.inProgress.length + 
            effectiveActivity.inReview.length + (effectiveActivity.blocked?.length || 0)
          : 0;

        return (
          <td 
            key={dateStr}
            className={cn(
              "min-w-[280px] w-[280px] border-r border-[#27272a] align-top",
              isTodayDay && "bg-blue-500/[0.03]",
              isFutureDay && "opacity-50"
            )}
          >
            {isExpanded ? (
              <WeekViewDayCell 
                dayActivity={effectiveActivity}
                onOpenModal={onOpenModal}
              />
            ) : (
              <div className="flex items-center justify-center py-4">
                {totalItems > 0 ? (
                  <span className="text-[12px] text-[#71717a]">{totalItems} items</span>
                ) : (
                  <span className="text-[12px] text-[#3f3f46]">—</span>
                )}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}


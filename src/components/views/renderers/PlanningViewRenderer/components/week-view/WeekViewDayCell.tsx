"use client";

import { 
  CheckCircle2,
  PlayCircle,
  Clock,
  Eye,
  Send,
  Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayActivity, IssueActivity } from '../../types';
import { WeekViewIssueItem } from './WeekViewIssueItem';

// ============================================================================
// Group Header
// ============================================================================

interface GroupHeaderProps {
  title: string;
  count: number;
  color: string;
  icon: React.ReactNode;
}

function GroupHeader({ title, count, color, icon }: GroupHeaderProps) {
  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1.5 mt-3 first:mt-1 border-t border-[#1f1f23]", color)}>
      {icon}
      <span className="text-[11px] font-medium uppercase tracking-wide">{title}</span>
      <span className="text-[11px] opacity-60">{count}</span>
    </div>
  );
}

// ============================================================================
// Day Cell Content
// ============================================================================

interface WeekViewDayCellProps {
  dayActivity: DayActivity | undefined;
  onOpenModal: (issueId: string) => void;
}

export function WeekViewDayCell({ dayActivity, onOpenModal }: WeekViewDayCellProps) {
  if (!dayActivity) {
    return <div className="text-[12px] text-[#3f3f46] px-3 py-3">—</div>;
  }

  const completed = dayActivity.completed || [];
  const movedToReview = dayActivity.movedToReview || [];
  const started = dayActivity.started || [];
  const inProgress = dayActivity.inProgress || [];
  const inReview = dayActivity.inReview || [];
  const blocked = dayActivity.blocked || [];
  
  // Deduplicate
  const seenIds = new Set<string>();
  const dedupeFilter = (issue: IssueActivity) => {
    if (seenIds.has(issue.issueId)) return false;
    seenIds.add(issue.issueId);
    return true;
  };

  const uniqueCompleted = completed.filter(dedupeFilter);
  const uniqueMovedToReview = movedToReview.filter(dedupeFilter);
  const uniqueStarted = started.filter(dedupeFilter);
  const uniqueInProgress = inProgress.filter(dedupeFilter);
  const uniqueInReview = inReview.filter(dedupeFilter);
  const uniqueBlocked = blocked.filter(dedupeFilter);

  const totalItems = uniqueCompleted.length + uniqueMovedToReview.length + 
    uniqueStarted.length + uniqueInProgress.length + uniqueInReview.length + uniqueBlocked.length;

  if (totalItems === 0) {
    return <div className="text-[12px] text-[#3f3f46] px-3 py-3">—</div>;
  }

  return (
    <div className="py-1">
      {uniqueCompleted.length > 0 && (
        <>
          <GroupHeader 
            title="Done" 
            count={uniqueCompleted.length} 
            color="text-emerald-400"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          />
          {uniqueCompleted.map(issue => (
            <WeekViewIssueItem key={issue.issueId} issue={issue} onOpenModal={onOpenModal} />
          ))}
        </>
      )}

      {uniqueMovedToReview.length > 0 && (
        <>
          <GroupHeader 
            title="Sent" 
            count={uniqueMovedToReview.length} 
            color="text-purple-400"
            icon={<Send className="h-3.5 w-3.5" />}
          />
          {uniqueMovedToReview.map(issue => (
            <WeekViewIssueItem key={issue.issueId} issue={issue} onOpenModal={onOpenModal} />
          ))}
        </>
      )}

      {uniqueStarted.length > 0 && (
        <>
          <GroupHeader 
            title="Started" 
            count={uniqueStarted.length} 
            color="text-blue-400"
            icon={<PlayCircle className="h-3.5 w-3.5" />}
          />
          {uniqueStarted.map(issue => (
            <WeekViewIssueItem key={issue.issueId} issue={issue} onOpenModal={onOpenModal} />
          ))}
        </>
      )}

      {uniqueInProgress.length > 0 && (
        <>
          <GroupHeader 
            title="Active" 
            count={uniqueInProgress.length} 
            color="text-amber-400"
            icon={<Clock className="h-3.5 w-3.5" />}
          />
          {uniqueInProgress.map(issue => (
            <WeekViewIssueItem key={issue.issueId} issue={issue} onOpenModal={onOpenModal} />
          ))}
        </>
      )}

      {uniqueInReview.length > 0 && (
        <>
          <GroupHeader 
            title="Review" 
            count={uniqueInReview.length} 
            color="text-violet-400"
            icon={<Eye className="h-3.5 w-3.5" />}
          />
          {uniqueInReview.map(issue => (
            <WeekViewIssueItem key={issue.issueId} issue={issue} onOpenModal={onOpenModal} />
          ))}
        </>
      )}

      {uniqueBlocked.length > 0 && (
        <>
          <GroupHeader 
            title="Blocked" 
            count={uniqueBlocked.length} 
            color="text-red-400"
            icon={<Ban className="h-3.5 w-3.5" />}
          />
          {uniqueBlocked.map(issue => (
            <WeekViewIssueItem key={issue.issueId} issue={issue} onOpenModal={onOpenModal} />
          ))}
        </>
      )}
    </div>
  );
}


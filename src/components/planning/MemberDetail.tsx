'use client';

import { useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, CheckCircle2, Clock, Eye, AlertTriangle, ListTodo, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import type { MemberActivity, DayActivity } from './types';
import { IssueRow, CompletedIssueRow, BlockedIssueRow } from './IssueRow';

interface MemberDetailProps {
  member: MemberActivity;
  onClose: () => void;
  onIssueClick?: (issueId: string) => void;
}

// =============================================================================
// Section Header
// =============================================================================

interface SectionHeaderProps {
  icon: typeof CheckCircle2;
  title: string;
  count: number;
  color: string;
}

function SectionHeader({ icon: Icon, title, count, color }: SectionHeaderProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 px-1 pt-4 pb-2">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color }}>
        {title}
      </span>
      <span className="text-[11px] text-[#3f3f46]">{count}</span>
    </div>
  );
}

// =============================================================================
// Day Section
// =============================================================================

interface DaySectionProps {
  dateKey: string;
  activity: DayActivity;
  onIssueClick?: (issueId: string) => void;
}

function DaySection({ dateKey, activity, onIssueClick }: DaySectionProps) {
  const date = parseISO(dateKey);
  const label = isToday(date) ? 'TODAY' : isYesterday(date) ? 'YESTERDAY' : format(date, 'EEEE');
  const dateStr = format(date, 'MMM d');

  const hasContent = activity.completed.length > 0 || activity.started.length > 0 || activity.movedToReview.length > 0;

  if (!hasContent) return null;

  return (
    <div className="border-b border-[#1f1f23] pb-3">
      {/* Day Header */}
      <div className="flex items-center gap-2 px-1 py-3">
        <span
          className={cn(
            'text-xs font-semibold',
            isToday(date) ? 'text-blue-400' : 'text-[#a1a1aa]'
          )}
        >
          {label}
        </span>
        <span className="text-xs text-[#52525b]">{dateStr}</span>
        {isToday(date) && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">
            LIVE
          </span>
        )}
      </div>

      {/* Completed */}
      {activity.completed.length > 0 && (
        <>
          <SectionHeader icon={CheckCircle2} title="Completed" count={activity.completed.length} color="#22c55e" />
          {activity.completed.map(issue => (
            <CompletedIssueRow
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}

      {/* Sent to Review */}
      {activity.movedToReview.length > 0 && (
        <>
          <SectionHeader icon={Eye} title="Sent to Review" count={activity.movedToReview.length} color="#8b5cf6" />
          {activity.movedToReview.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              showDaysActive={false}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}

      {/* Started */}
      {activity.started.length > 0 && (
        <>
          <SectionHeader icon={Clock} title="Started" count={activity.started.length} color="#3b82f6" />
          {activity.started.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              showDaysActive={false}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Current State Section
// =============================================================================

interface CurrentStateSectionProps {
  member: MemberActivity;
  onIssueClick?: (issueId: string) => void;
}

function CurrentStateSection({ member, onIssueClick }: CurrentStateSectionProps) {
  const { current } = member;
  const hasContent = current.inProgress.length > 0 || current.inReview.length > 0 ||
                     current.blocked.length > 0 || current.planned.length > 0;

  if (!hasContent) return null;

  return (
    <div className="pt-2">
      <div className="px-1 pb-2">
        <span className="text-[11px] font-medium text-[#52525b] uppercase tracking-wider">
          Current State
        </span>
      </div>

      {/* In Progress */}
      {current.inProgress.length > 0 && (
        <>
          <SectionHeader icon={Clock} title="Working On" count={current.inProgress.length} color="#3b82f6" />
          {current.inProgress.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}

      {/* In Review */}
      {current.inReview.length > 0 && (
        <>
          <SectionHeader icon={Eye} title="In Review" count={current.inReview.length} color="#8b5cf6" />
          {current.inReview.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}

      {/* Blocked */}
      {current.blocked.length > 0 && (
        <>
          <SectionHeader icon={AlertTriangle} title="Blocked" count={current.blocked.length} color="#ef4444" />
          {current.blocked.map(issue => (
            <BlockedIssueRow
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}

      {/* Planned */}
      {current.planned.length > 0 && (
        <>
          <SectionHeader icon={ListTodo} title="Planned" count={current.planned.length} color="#6b7280" />
          {current.planned.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              showDaysActive={false}
              onClick={() => onIssueClick?.(issue.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MemberDetail({ member, onClose, onIssueClick }: MemberDetailProps) {
  const { user, summary, days, warnings } = member;

  // Sort days by date (most recent first)
  const sortedDays = useMemo(() => {
    return Object.entries(days).sort(([a], [b]) => b.localeCompare(a));
  }, [days]);

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f23]">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        <Avatar className="h-10 w-10">
          <AvatarImage src={user.image || undefined} />
          <AvatarFallback className="bg-[#27272a] text-[#fafafa] text-sm font-medium">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-[#fafafa] truncate">{user.name}</h2>
          <div className="flex items-center gap-3 text-[11px] text-[#71717a]">
            <span className="text-emerald-400">{summary.completed} completed</span>
            <span>{summary.inProgress + summary.inReview} active</span>
            {summary.blocked > 0 && (
              <span className="text-red-400">{summary.blocked} blocked</span>
            )}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
          {warnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-2 py-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-amber-400/90">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Day activities */}
          {sortedDays.map(([dateKey, activity]) => (
            <DaySection
              key={dateKey}
              dateKey={dateKey}
              activity={activity}
              onIssueClick={onIssueClick}
            />
          ))}

          {/* Current state */}
          <CurrentStateSection member={member} onIssueClick={onIssueClick} />
        </div>
      </ScrollArea>
    </div>
  );
}

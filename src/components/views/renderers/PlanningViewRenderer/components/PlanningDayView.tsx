"use client";

import { useState, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  Circle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import { getIssuePriorityBadge, PRIORITY_CONFIG } from '@/utils/issueHelpers';
import { ISSUE_TYPE_CONFIG, type IssueType } from '@/constants/issue-types';
import type { IssuePriority } from '@/types/issue';
import type { TeamMemberRangeSync, DayActivity, IssueActivity } from '../types';
import { format, subDays } from 'date-fns';

interface PlanningDayViewProps {
  members: TeamMemberRangeSync[];
  workspaceSlug: string;
  selectedDate: Date;
}

// ============================================================================
// Status helpers
// ============================================================================

const getStatusDotColor = (status: string) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete')) return 'bg-emerald-500';
  if (s.includes('progress')) return 'bg-blue-500';
  if (s.includes('review') || s.includes('testing')) return 'bg-violet-500';
  if (s.includes('block')) return 'bg-red-500';
  if (s.includes('backlog')) return 'bg-slate-400';
  return 'bg-slate-500';
};

const getStatusIcon = (status: string) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete')) return CheckCircle2;
  if (s.includes('progress') || s.includes('review') || s.includes('testing')) return Clock;
  if (s.includes('block')) return AlertCircle;
  return Circle;
};

const getStatusIconColor = (status: string) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete')) return 'text-emerald-500';
  if (s.includes('progress')) return 'text-blue-500';
  if (s.includes('review') || s.includes('testing')) return 'text-violet-500';
  if (s.includes('block')) return 'text-red-500';
  return 'text-slate-500';
};

// ============================================================================
// Badge Component - Clean minimal style
// ============================================================================

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

function Badge({ children, className }: BadgeProps) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#1c1c1e] border border-[#2a2a2e] text-[#a1a1aa]",
      className
    )}>
      {children}
    </div>
  );
}

// ============================================================================
// Issue Item - Clean with hover badges
// ============================================================================

interface IssueItemProps {
  issue: IssueActivity;
  workspaceSlug: string;
  onOpenModal: (issueId: string) => void;
}

function IssueItem({ issue, workspaceSlug, onOpenModal }: IssueItemProps) {
  const statusDotColor = getStatusDotColor(issue.statusText);
  const StatusIcon = getStatusIcon(issue.statusText);
  const statusIconColor = getStatusIconColor(issue.statusText);
  const statusLabel = issue.statusDisplayName || issue.statusText;
  const showDaysWarning = issue.daysInProgress !== undefined && issue.daysInProgress >= 5;

  // Priority
  const priorityBadge = issue.priority ? getIssuePriorityBadge(issue.priority as IssuePriority) : null;
  const PriorityIcon = priorityBadge?.icon;
  const priorityConfig = issue.priority 
    ? (PRIORITY_CONFIG[issue.priority.toUpperCase() as IssuePriority] || PRIORITY_CONFIG.MEDIUM)
    : null;

  // Type
  const typeConfig = ISSUE_TYPE_CONFIG.TASK; // Default, can extend if issueType is available
  const TypeIcon = typeConfig.icon;

  return (
    <div 
      className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#18181b] cursor-pointer transition-colors"
      onClick={() => onOpenModal(issue.issueId)}
    >
      {/* Status dot */}
      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusDotColor)} />

      {/* Issue key */}
      <span className="text-[#71717a] text-xs font-mono flex-shrink-0 w-16">
        {issue.issueKey}
      </span>

      {/* Title */}
      <span className="flex-1 text-[#fafafa] text-[13px] truncate group-hover:text-[#a1a1aa] transition-colors">
        {issue.title}
      </span>

      {/* Badges - visible on hover */}
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Status */}
        <Badge>
          <StatusIcon className={cn("h-3 w-3", statusIconColor)} />
          <span>{statusLabel}</span>
        </Badge>

        {/* Priority */}
        {PriorityIcon && priorityConfig && (
          <Badge>
            <PriorityIcon className={cn("h-3 w-3", priorityConfig.color)} />
            <span>{priorityBadge?.label}</span>
          </Badge>
        )}

        {/* Type */}
        <Badge>
          <TypeIcon className="h-3 w-3" style={{ color: typeConfig.color }} />
          <span>{typeConfig.label}</span>
        </Badge>

        {/* Project */}
        <Badge className="max-w-[100px]">
          <span className="truncate">{issue.projectName}</span>
        </Badge>

        {/* Days warning */}
        {showDaysWarning && (
          <Badge className="bg-orange-500/10 border-orange-500/20 text-orange-400">
            {issue.daysInProgress}d
          </Badge>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Group Header - Linear style
// ============================================================================

interface GroupHeaderProps {
  title: string;
  count: number;
}

function GroupHeader({ title, count }: GroupHeaderProps) {
  if (count === 0) return null;
  
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-1">
      <span className="text-[11px] font-medium text-[#71717a]">
        {title}
      </span>
      <span className="text-[11px] text-[#3f3f46]">{count}</span>
    </div>
  );
}

// ============================================================================
// Day Column - Linear style
// ============================================================================

interface DayColumnProps {
  title: string;
  date: string;
  activity: DayActivity | undefined;
  workspaceSlug: string;
  isToday: boolean;
  yesterdayInProgressIds?: Set<string>;
  onOpenModal: (issueId: string) => void;
}

function DayColumn({ 
  title, 
  date, 
  activity, 
  workspaceSlug, 
  isToday, 
  yesterdayInProgressIds,
  onOpenModal 
}: DayColumnProps) {
  // Separate carried over vs new in progress for today (excluding blocked)
  const { carriedOver, currentInProgress, carriedOverBlocked, currentBlocked } = useMemo(() => {
    if (!activity || !isToday || !yesterdayInProgressIds) {
      return { 
        carriedOver: [], 
        currentInProgress: activity?.inProgress || [],
        carriedOverBlocked: [],
        currentBlocked: activity?.blocked || []
      };
    }
    
    const carried: IssueActivity[] = [];
    const current: IssueActivity[] = [];
    const carriedBlocked: IssueActivity[] = [];
    const newBlocked: IssueActivity[] = [];
    
    // Separate in progress issues
    activity.inProgress.forEach(issue => {
      if (yesterdayInProgressIds.has(issue.issueId)) {
        carried.push(issue);
      } else {
        current.push(issue);
      }
    });

    // Separate blocked issues
    (activity.blocked || []).forEach(issue => {
      if (yesterdayInProgressIds.has(issue.issueId)) {
        carriedBlocked.push(issue);
      } else {
        newBlocked.push(issue);
      }
    });
    
    return { 
      carriedOver: carried, 
      currentInProgress: current,
      carriedOverBlocked: carriedBlocked,
      currentBlocked: newBlocked
    };
  }, [activity, isToday, yesterdayInProgressIds]);

  const isEmpty = !activity || (
    activity.completed.length === 0 &&
    activity.started.length === 0 &&
    (activity.movedToReview?.length || 0) === 0 &&
    activity.inProgress.length === 0 &&
    activity.inReview.length === 0 &&
    (activity.blocked?.length || 0) === 0 &&
    activity.planned.length === 0
  );

  return (
    <div className="flex-1 min-w-0">
      {/* Column Header */}
      <div className={cn(
        "px-4 py-3 border-b border-[#27272a]",
        isToday && "bg-blue-500/[0.03]"
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[13px] font-medium",
            isToday ? "text-blue-400" : "text-[#fafafa]"
          )}>
            {title}
          </span>
          <span className="text-[12px] text-[#52525b]">{date}</span>
          {isToday && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium ml-auto">
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="py-1">
        {isEmpty ? (
          <div className="text-center py-8 text-[#52525b] text-[13px]">
            No activity
          </div>
        ) : (
          <>
            {/* Completed */}
            {activity && activity.completed.length > 0 && (
              <>
                <GroupHeader title={isToday ? "Completed today" : "Completed"} count={activity.completed.length} />
                {activity.completed.map(issue => (
                  <IssueItem key={issue.issueId} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}

            {/* Moved to Review - shows issues that transitioned to review/testing/deploy */}
            {activity && activity.movedToReview && activity.movedToReview.length > 0 && (
              <>
                <GroupHeader title={isToday ? "Sent to review" : "Sent to review"} count={activity.movedToReview.length} />
                {activity.movedToReview.map(issue => (
                  <IssueItem key={`review-${issue.issueId}`} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}

            {/* Started */}
            {activity && activity.started.length > 0 && (
              <>
                <GroupHeader title={isToday ? "Started today" : "Started"} count={activity.started.length} />
                {activity.started.map(issue => (
                  <IssueItem key={`started-${issue.issueId}`} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}

            {/* Carried Over (today only) */}
            {isToday && carriedOver.length > 0 && (
              <>
                <GroupHeader title="Carried over" count={carriedOver.length} />
                {carriedOver.map(issue => (
                  <IssueItem key={issue.issueId} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}

            {/* In Progress */}
            {(isToday ? currentInProgress : activity?.inProgress || []).length > 0 && (
              <>
                <GroupHeader title="In progress" count={isToday ? currentInProgress.length : activity?.inProgress.length || 0} />
                {(isToday ? currentInProgress : activity?.inProgress || []).map(issue => (
                  <IssueItem key={issue.issueId} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}

            {/* In Review */}
            {activity && activity.inReview.length > 0 && (
              <>
                <GroupHeader title="In review" count={activity.inReview.length} />
                {activity.inReview.map(issue => (
                  <IssueItem key={issue.issueId} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}

            {/* Blocked (today: show carried and new separately, yesterday: show all) */}
            {isToday ? (
              <>
                {carriedOverBlocked.length > 0 && (
                  <>
                    <GroupHeader title="Blocked (carried)" count={carriedOverBlocked.length} />
                    {carriedOverBlocked.map(issue => (
                      <IssueItem key={`blocked-carried-${issue.issueId}`} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                    ))}
                  </>
                )}
                {currentBlocked.length > 0 && (
                  <>
                    <GroupHeader title="Blocked" count={currentBlocked.length} />
                    {currentBlocked.map(issue => (
                      <IssueItem key={`blocked-${issue.issueId}`} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                    ))}
                  </>
                )}
              </>
            ) : (
              activity && activity.blocked && activity.blocked.length > 0 && (
                <>
                  <GroupHeader title="Blocked" count={activity.blocked.length} />
                  {activity.blocked.map(issue => (
                    <IssueItem key={`blocked-${issue.issueId}`} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                  ))}
                </>
              )
            )}

            {/* Planned (today only) - only shows to_do status issues */}
            {isToday && activity && activity.planned.length > 0 && (
              <>
                <GroupHeader title="Planned" count={activity.planned.length} />
                {activity.planned.map(issue => (
                  <IssueItem key={issue.issueId} issue={issue} workspaceSlug={workspaceSlug} onOpenModal={onOpenModal} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Stat Badge Component
// ============================================================================

interface StatBadgeProps {
  count: number;
  label: string;
  color: 'emerald' | 'blue' | 'violet' | 'slate' | 'amber' | 'orange' | 'purple';
  showZero?: boolean;
}

function StatBadge({ count, label, color, showZero = false }: StatBadgeProps) {
  if (count === 0 && !showZero) return null;
  
  const colorStyles = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    slate: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };

  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
      colorStyles[color]
    )}>
      <span>{count}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

// ============================================================================
// Member Card - Linear style
// ============================================================================

interface MemberCardProps {
  member: TeamMemberRangeSync;
  workspaceSlug: string;
  yesterdayDate: string;
  todayDate: string;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenModal: (issueId: string) => void;
}

function MemberCard({
  member,
  workspaceSlug,
  yesterdayDate,
  todayDate,
  isExpanded,
  onToggle,
  onOpenModal,
}: MemberCardProps) {
  const yesterdayActivity = member.days[yesterdayDate];
  const todayActivity = member.days[todayDate];
  
  // IDs of issues that were in progress/blocked yesterday (for carried over detection)
  const yesterdayInProgressIds = useMemo(() => {
    if (!yesterdayActivity) return new Set<string>();
    return new Set([
      ...yesterdayActivity.inProgress.map(i => i.issueId),
      ...yesterdayActivity.inReview.map(i => i.issueId),
      ...(yesterdayActivity.blocked || []).map(i => i.issueId),
    ]);
  }, [yesterdayActivity]);

  const hasWarnings = member.insights.warnings.length > 0;
  
  // Stats
  const completed = (yesterdayActivity?.completed.length || 0) + (todayActivity?.completed.length || 0);
  const sentToReview = (yesterdayActivity?.movedToReview?.length || 0) + (todayActivity?.movedToReview?.length || 0);
  const inProgress = todayActivity?.inProgress.length || 0;
  const inReview = todayActivity?.inReview.length || 0;
  const blocked = todayActivity?.blocked?.length || 0;
  const planned = todayActivity?.planned.length || 0;
  const carriedOver = yesterdayInProgressIds.size > 0 
    ? ((todayActivity?.inProgress.filter(i => yesterdayInProgressIds.has(i.issueId)).length || 0) +
       (todayActivity?.blocked?.filter(i => yesterdayInProgressIds.has(i.issueId)).length || 0))
    : 0;

  return (
    <div className="bg-[#09090b] rounded-lg border border-[#27272a] overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#18181b] transition-colors"
      >
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={member.userImage} />
          <AvatarFallback className="bg-[#27272a] text-[#fafafa] text-xs font-medium">
            {member.userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Name */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-[#fafafa] truncate">
            {member.userName}
          </span>
          {hasWarnings && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] text-amber-400 font-medium">{member.insights.warnings.length}</span>
            </div>
          )}
        </div>

        {/* Stats badges - pushed to right */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          <StatBadge count={completed} label="done" color="emerald" />
          <StatBadge count={sentToReview} label="sent" color="purple" />
          <StatBadge count={inProgress} label="active" color="blue" />
          <StatBadge count={inReview} label="review" color="violet" />
          <StatBadge count={blocked} label="blocked" color="amber" />
          <StatBadge count={carriedOver} label="carried" color="orange" />
          <StatBadge count={planned} label="planned" color="slate" />
        </div>

        <ChevronRight className={cn(
          "h-4 w-4 text-[#52525b] transition-transform flex-shrink-0",
          isExpanded && "rotate-90"
        )} />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[#27272a]">
          {/* Warnings */}
          {hasWarnings && (
            <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10 space-y-1">
              {member.insights.warnings.map((warning, idx) => (
                <div key={idx} className="text-[11px] text-amber-500/80 flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  {warning}
                </div>
              ))}
            </div>
          )}

          {/* Two columns */}
          <div className="grid grid-cols-2 divide-x divide-[#27272a]">
            <DayColumn
              title="Yesterday"
              date={format(new Date(yesterdayDate), 'MMM d')}
              activity={yesterdayActivity}
              workspaceSlug={workspaceSlug}
              isToday={false}
              onOpenModal={onOpenModal}
            />
            <DayColumn
              title="Today"
              date={format(new Date(todayDate), 'MMM d')}
              activity={todayActivity}
              workspaceSlug={workspaceSlug}
              isToday={true}
              yesterdayInProgressIds={yesterdayInProgressIds}
              onOpenModal={onOpenModal}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlanningDayView({
  members,
  workspaceSlug,
  selectedDate,
}: PlanningDayViewProps) {
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(() => 
    new Set(members.map(m => m.userId))
  );
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const todayDate = format(selectedDate, 'yyyy-MM-dd');
  const yesterdayDate = format(subDays(selectedDate, 1), 'yyyy-MM-dd');

  // Sort members consistently by name (alphabetical)
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => 
      a.userName.localeCompare(b.userName)
    );
  }, [members]);

  const toggleMember = (userId: string) => {
    const next = new Set(expandedMembers);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setExpandedMembers(next);
  };

  if (members.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#3f3f46] text-[13px]">No team activity found</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedMembers.map((member) => (
          <MemberCard
            key={member.userId}
            member={member}
            workspaceSlug={workspaceSlug}
            yesterdayDate={yesterdayDate}
            todayDate={todayDate}
            isExpanded={expandedMembers.has(member.userId)}
            onToggle={() => toggleMember(member.userId)}
            onOpenModal={setSelectedIssueId}
          />
        ))}
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

'use client';

import { useState, useMemo } from 'react';
import { format, subDays, isToday, addDays } from 'date-fns';
import {
  Loader2,
  CheckCircle2,
  Clock,
  Eye,
  AlertTriangle,
  Play,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Zap,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useTeamActivity } from './useTeamActivity';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import { StandupView } from './StandupView';
import type { MemberActivity, SimpleIssue, CompletedIssue, BlockedIssue, MemberCurrentState, DayActivity } from './types';

interface TeamDashboardProps {
  workspaceId: string;
  workspaceSlug: string;
  projectIds?: string[];
  userIds?: string[];
}

// =============================================================================
// Status Prettifier - Convert status names to readable format
// =============================================================================

function prettifyStatus(status: string | undefined): string {
  if (!status || status === 'Unknown') return '';

  // Convert snake_case or kebab-case to Title Case
  return status
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// Issue Card - Modern design with better badges
// =============================================================================

type StatusType = 'completed' | 'inProgress' | 'inReview' | 'blocked' | 'planned' | 'started';

const STATUS_STYLES: Record<StatusType, {
  accent: string;
  bg: string;
  badgeBg: string;
  badgeText: string;
}> = {
  completed: {
    accent: 'bg-emerald-500',
    bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
  },
  inProgress: {
    accent: 'bg-blue-500',
    bg: 'bg-blue-500/5 hover:bg-blue-500/10',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-300',
  },
  inReview: {
    accent: 'bg-violet-500',
    bg: 'bg-violet-500/5 hover:bg-violet-500/10',
    badgeBg: 'bg-violet-500/20',
    badgeText: 'text-violet-300',
  },
  blocked: {
    accent: 'bg-red-500',
    bg: 'bg-red-500/5 hover:bg-red-500/10',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-300',
  },
  planned: {
    accent: 'bg-zinc-500',
    bg: 'bg-zinc-500/5 hover:bg-zinc-500/10',
    badgeBg: 'bg-zinc-500/20',
    badgeText: 'text-zinc-300',
  },
  started: {
    accent: 'bg-sky-500',
    bg: 'bg-sky-500/5 hover:bg-sky-500/10',
    badgeBg: 'bg-sky-500/20',
    badgeText: 'text-sky-300',
  },
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface IssueCardProps {
  issue: SimpleIssue | CompletedIssue | BlockedIssue;
  status: StatusType;
  onClick?: () => void;
  compact?: boolean;
}

function formatDaysActive(days: number | undefined): string {
  if (days === undefined || days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function IssueCard({ issue, status, onClick, compact }: IssueCardProps) {
  const style = STATUS_STYLES[status];
  const blockedIssue = issue as BlockedIssue;
  const completedIssue = issue as CompletedIssue;

  // Get prettified status label
  const statusLabel = prettifyStatus(issue.statusLabel);

  // Show days active for active statuses (not completed or planned)
  const showDaysActive = ['inProgress', 'inReview', 'blocked', 'started'].includes(status);
  const daysActive = issue.daysActive ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border border-[#1f1f23] transition-all',
        style.bg,
        compact ? 'p-2.5' : 'p-3'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn('w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0', style.accent)} />
        <div className="flex-1 min-w-0">
          {/* Top row: Key, Status, Time/Duration */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {/* Issue Key Badge */}
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">
              {issue.key}
            </span>

            {/* Status Badge */}
            {statusLabel && (
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                style.badgeBg,
                style.badgeText
              )}>
                {statusLabel}
              </span>
            )}

            {/* Completion Time Badge */}
            {completedIssue.completedAt && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {formatTime(completedIssue.completedAt)}
              </span>
            )}

            {/* Days in Status Badge - Always show for active statuses */}
            {showDaysActive && (
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                daysActive >= 7
                  ? 'bg-red-500/20 text-red-300'
                  : daysActive >= 3
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-zinc-500/20 text-zinc-400'
              )}>
                {formatDaysActive(daysActive)}
              </span>
            )}
          </div>

          {/* Title */}
          <p className={cn(
            'text-[#e4e4e7] leading-snug',
            compact ? 'text-xs line-clamp-1' : 'text-[13px] line-clamp-2'
          )}>
            {issue.title}
          </p>

          {/* Blocked By */}
          {blockedIssue.blockedBy && (
            <p className="text-[10px] text-red-400/80 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              Blocked by {blockedIssue.blockedBy}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Collapsible Section - Improved clickability and visual clarity
// =============================================================================

interface CollapsibleSectionProps {
  icon: typeof Clock;
  color: string;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  icon: Icon,
  color,
  title,
  count,
  children,
  defaultExpanded = true
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (count === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-all',
          'hover:bg-[#18181b] active:bg-[#1f1f23]',
          'border border-transparent hover:border-[#27272a]',
          'group cursor-pointer'
        )}
      >
        {/* Chevron indicator - more prominent */}
        <div className={cn(
          'flex items-center justify-center w-5 h-5 rounded transition-colors',
          'bg-[#1f1f23] group-hover:bg-[#27272a]'
        )}>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#71717a] group-hover:text-[#a1a1aa]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#71717a] group-hover:text-[#a1a1aa]" />
          )}
        </div>

        {/* Icon with color */}
        <div
          className="w-5 h-5 rounded flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-3 w-3" style={{ color }} />
        </div>

        {/* Title */}
        <span className="text-sm font-medium text-[#e4e4e7] group-hover:text-white transition-colors">
          {title}
        </span>

        {/* Count badge */}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${color}20`,
            color: color,
          }}
        >
          {count}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand/collapse hint text */}
        <span className="text-[10px] text-[#52525b] group-hover:text-[#71717a] transition-colors">
          {isExpanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="ml-7 mt-2 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Expandable List - For "+X more" functionality
// =============================================================================

interface ExpandableIssueListProps {
  issues: SimpleIssue[];
  status: StatusType;
  onIssueClick: (id: string) => void;
  initialLimit?: number;
}

function ExpandableIssueList({
  issues,
  status,
  onIssueClick,
  initialLimit = 5
}: ExpandableIssueListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayedIssues = isExpanded ? issues : issues.slice(0, initialLimit);
  const remainingCount = issues.length - initialLimit;

  return (
    <>
      {displayedIssues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          status={status}
          onClick={() => onIssueClick(issue.id)}
          compact
        />
      ))}
      {remainingCount > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'w-full text-center py-2 rounded-lg border border-dashed transition-all',
            'border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b]',
            'text-xs font-medium text-[#71717a] hover:text-[#a1a1aa]'
          )}
        >
          {isExpanded ? (
            <span className="flex items-center justify-center gap-1">
              <ChevronUp className="h-3 w-3" />
              Show less
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1">
              <ChevronDown className="h-3 w-3" />
              +{remainingCount} more
            </span>
          )}
        </button>
      )}
    </>
  );
}

// =============================================================================
// Member Pill Selector - Fixed red dot overflow
// =============================================================================

interface MemberSelectorProps {
  members: MemberActivity[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function MemberSelector({ members, selectedId, onSelect }: MemberSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
      {members.map((member) => {
        const isSelected = selectedId === member.user.id;
        return (
          <button
            key={member.user.id}
            onClick={() => onSelect(member.user.id)}
            className={cn(
              'relative flex items-center gap-2 px-2 py-1.5 rounded-full transition-all flex-shrink-0',
              isSelected
                ? 'bg-blue-600 text-white'
                : 'bg-[#18181b] text-[#a1a1aa] hover:bg-[#1f1f23] hover:text-white'
            )}
          >
            <div className="relative">
              <Avatar className="h-5 w-5">
                <AvatarImage src={member.user.image || undefined} />
                <AvatarFallback className="text-[10px] bg-[#27272a]">
                  {member.user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {/* Red dot inside the container, positioned properly */}
              {member.hasBlockers && !isSelected && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[#18181b]" />
              )}
            </div>
            <span className="text-xs font-medium">
              {member.user.name.split(' ')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Date Navigator
// =============================================================================

interface DateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

function DateNavigator({ selectedDate, onDateChange }: DateNavigatorProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const viewingToday = isToday(selectedDate);

  return (
    <div className="flex items-center gap-1 bg-[#18181b] rounded-lg p-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDateChange(subDays(selectedDate, 1))}
        className="h-7 w-7 p-0 text-[#71717a] hover:text-white hover:bg-[#27272a] rounded-md"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
              viewingToday
                ? 'bg-blue-600 text-white'
                : 'text-[#fafafa] hover:bg-[#27272a]'
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            {viewingToday ? 'Today' : format(selectedDate, 'MMM d, yyyy')}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-[#0f0f10] border-[#27272a]" align="center">
          <CalendarPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => { if (date) { onDateChange(date); setOpen(false); } }}
            disabled={(date) => date > today}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => !viewingToday && onDateChange(addDays(selectedDate, 1))}
        disabled={viewingToday}
        className="h-7 w-7 p-0 text-[#71717a] hover:text-white hover:bg-[#27272a] rounded-md disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!viewingToday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDateChange(new Date())}
          className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md ml-1"
        >
          Today
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// Date Report View - Shows all data for a single date
// =============================================================================

interface DateReportProps {
  member: MemberActivity;
  selectedDate: Date;
  onIssueClick: (id: string) => void;
}

function DateReport({ member, selectedDate, onIssueClick }: DateReportProps) {
  const viewingToday = isToday(selectedDate);
  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const dayData = member.days[dateKey];

  // For today, use current state; for past dates, use historical snapshot
  const state: MemberCurrentState = viewingToday
    ? member.current
    : (dayData?.snapshot || { inProgress: [], inReview: [], blocked: [], planned: [] });

  // Activity that happened ON this date
  const activity: DayActivity | null = dayData || null;

  // Calculate stats
  const completedCount = activity?.completed.length || 0;
  const startedCount = activity?.started.length || 0;
  const reviewedCount = activity?.movedToReview.length || 0;
  const blockedCount = state.blocked.length;
  const inProgressCount = state.inProgress.length;
  const inReviewCount = state.inReview.length;
  const plannedCount = state.planned.length;

  const hasActivity = completedCount > 0 || startedCount > 0 || reviewedCount > 0;
  const hasState = blockedCount > 0 || inProgressCount > 0 || inReviewCount > 0 || plannedCount > 0;

  const dateLabel = viewingToday ? 'Today' : format(selectedDate, 'EEEE, MMMM d');

  return (
    <div className="h-full flex flex-col">
      {/* Date Header with Stats */}
      <div className="px-5 py-3 border-b border-[#1f1f23] bg-[#0a0a0b]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[#fafafa]">{dateLabel}</h2>
            <p className="text-[11px] text-[#52525b] mt-0.5">
              {viewingToday ? 'Current work state' : 'Historical snapshot'}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3">
            {completedCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-400">{completedCount}</span>
              </div>
            )}
            {inProgressCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-blue-400">{inProgressCount}</span>
              </div>
            )}
            {inReviewCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-500/10">
                <Eye className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs font-medium text-violet-400">{inReviewCount}</span>
              </div>
            )}
            {blockedCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-400">{blockedCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-5">
          {!hasActivity && !hasState ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-[#18181b] flex items-center justify-center mx-auto mb-3">
                <Calendar className="h-5 w-5 text-[#3f3f46]" />
              </div>
              <p className="text-sm text-[#52525b]">No data for this date</p>
              <p className="text-xs text-[#3f3f46] mt-1">
                {viewingToday ? 'No active work assigned' : 'No recorded activity'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column: Activity (What Happened) */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#1f1f23]">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-semibold text-[#fafafa] uppercase tracking-wider">
                    Activity
                  </h3>
                </div>

                {hasActivity ? (
                  <div className="space-y-1">
                    {/* Completed */}
                    <CollapsibleSection
                      icon={CheckCircle2}
                      color="#22c55e"
                      title="Completed"
                      count={completedCount}
                    >
                      {activity?.completed.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          status="completed"
                          onClick={() => onIssueClick(issue.id)}
                          compact
                        />
                      ))}
                    </CollapsibleSection>

                    {/* Started */}
                    <CollapsibleSection
                      icon={ArrowRight}
                      color="#0ea5e9"
                      title="Started"
                      count={startedCount}
                    >
                      {activity?.started.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          status="started"
                          onClick={() => onIssueClick(issue.id)}
                          compact
                        />
                      ))}
                    </CollapsibleSection>

                    {/* Moved to Review */}
                    <CollapsibleSection
                      icon={Eye}
                      color="#8b5cf6"
                      title="Moved to Review"
                      count={reviewedCount}
                    >
                      {activity?.movedToReview.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          status="inReview"
                          onClick={() => onIssueClick(issue.id)}
                          compact
                        />
                      ))}
                    </CollapsibleSection>
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-[#27272a] rounded-lg">
                    <p className="text-xs text-[#3f3f46]">No activity recorded</p>
                  </div>
                )}
              </div>

              {/* Right Column: State (Work Snapshot) */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#1f1f23]">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <h3 className="text-xs font-semibold text-[#fafafa] uppercase tracking-wider">
                    Work State
                  </h3>
                </div>

                {hasState ? (
                  <div className="space-y-1">
                    {/* Blocked */}
                    <CollapsibleSection
                      icon={AlertTriangle}
                      color="#ef4444"
                      title="Blocked"
                      count={blockedCount}
                    >
                      {state.blocked.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          status="blocked"
                          onClick={() => onIssueClick(issue.id)}
                          compact
                        />
                      ))}
                    </CollapsibleSection>

                    {/* In Review */}
                    <CollapsibleSection
                      icon={Eye}
                      color="#8b5cf6"
                      title="In Review"
                      count={inReviewCount}
                    >
                      {state.inReview.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          status="inReview"
                          onClick={() => onIssueClick(issue.id)}
                          compact
                        />
                      ))}
                    </CollapsibleSection>

                    {/* In Progress */}
                    <CollapsibleSection
                      icon={Clock}
                      color="#3b82f6"
                      title="In Progress"
                      count={inProgressCount}
                    >
                      {state.inProgress.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          status="inProgress"
                          onClick={() => onIssueClick(issue.id)}
                          compact
                        />
                      ))}
                    </CollapsibleSection>

                    {/* Planned - with expandable list */}
                    <CollapsibleSection
                      icon={Calendar}
                      color="#71717a"
                      title="Planned"
                      count={plannedCount}
                      defaultExpanded={plannedCount <= 5}
                    >
                      <ExpandableIssueList
                        issues={state.planned}
                        status="planned"
                        onIssueClick={onIssueClick}
                        initialLimit={5}
                      />
                    </CollapsibleSection>
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-[#27272a] rounded-lg">
                    <p className="text-xs text-[#3f3f46]">No active work</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Main Dashboard
// =============================================================================

export function TeamDashboard({
  workspaceId,
  workspaceSlug: _workspaceSlug,
  projectIds,
  userIds,
}: TeamDashboardProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showStandup, setShowStandup] = useState(false);

  const { data, isLoading, error } = useTeamActivity({
    workspaceId,
    startDate: subDays(new Date(), 60),
    endDate: new Date(),
    projectIds,
    userIds,
  });

  const effectiveMemberId = selectedMemberId || data?.members?.[0]?.user.id || null;

  const selectedMember = useMemo(() => {
    if (!effectiveMemberId || !data?.members) return null;
    return data.members.find(m => m.user.id === effectiveMemberId) || null;
  }, [effectiveMemberId, data?.members]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b]">
        <Loader2 className="h-5 w-5 animate-spin text-[#52525b]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b]">
        <p className="text-sm text-red-400">Failed to load team data</p>
      </div>
    );
  }

  if (showStandup) {
    return (
      <StandupView
        members={data.members}
        onClose={() => setShowStandup(false)}
        onIssueClick={setSelectedIssueId}
      />
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 bg-[#09090b]">
        {/* Compact Header */}
        <div className="px-4 py-2.5 border-b border-[#1f1f23] bg-[#0c0c0d]">
          <div className="flex items-center justify-between gap-4">
            <MemberSelector
              members={data.members}
              selectedId={effectiveMemberId || ''}
              onSelect={setSelectedMemberId}
            />

            <div className="flex items-center gap-2 flex-shrink-0">
              <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />
              <Button
                onClick={() => setShowStandup(true)}
                size="sm"
                className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-xs"
              >
                <Play className="h-3.5 w-3.5" />
                Standup
              </Button>
            </div>
          </div>
        </div>

        {/* Member Badge - Simple name display */}
        {selectedMember && (
          <div className="px-4 py-2 border-b border-[#18181b] bg-[#0a0a0b] flex items-center gap-3">
            <Avatar className="h-7 w-7">
              <AvatarImage src={selectedMember.user.image || undefined} />
              <AvatarFallback className="text-xs bg-[#27272a]">
                {selectedMember.user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-[#fafafa]">{selectedMember.user.name}</span>
          </div>
        )}

        {/* Date Report */}
        <div className="flex-1 min-h-0">
          {selectedMember && (
            <DateReport
              member={selectedMember}
              selectedDate={selectedDate}
              onIssueClick={setSelectedIssueId}
            />
          )}
        </div>
      </div>

      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </>
  );
}

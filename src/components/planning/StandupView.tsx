'use client';

import { useState, useMemo, useCallback } from 'react';
import { format, subDays, isMonday, previousFriday } from 'date-fns';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Eye,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { MemberActivity, SimpleIssue, CompletedIssue, BlockedIssue } from './types';

// =============================================================================
// Types
// =============================================================================

interface StandupViewProps {
  members: MemberActivity[];
  onClose: () => void;
  onIssueClick: (id: string) => void;
}

// =============================================================================
// Get "yesterday" with weekend skipping
// =============================================================================

function getWorkingYesterday(today: Date): Date {
  // If it's Monday, yesterday is Friday
  if (isMonday(today)) {
    return previousFriday(today);
  }
  // Otherwise, just go back one day
  return subDays(today, 1);
}

function getWorkingYesterdayLabel(today: Date): string {
  if (isMonday(today)) {
    return 'Friday';
  }
  return 'Yesterday';
}

// =============================================================================
// Issue Status Badge
// =============================================================================

type StatusType = 'completed' | 'inProgress' | 'inReview' | 'blocked' | 'planned';

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  completed: {
    label: 'Completed',
    color: '#22c55e',
    bgColor: 'bg-emerald-500/10',
    icon: CheckCircle2,
  },
  inProgress: {
    label: 'In Progress',
    color: '#3b82f6',
    bgColor: 'bg-blue-500/10',
    icon: Clock,
  },
  inReview: {
    label: 'In Review',
    color: '#8b5cf6',
    bgColor: 'bg-violet-500/10',
    icon: Eye,
  },
  blocked: {
    label: 'Blocked',
    color: '#ef4444',
    bgColor: 'bg-red-500/10',
    icon: AlertTriangle,
  },
  planned: {
    label: 'Planned',
    color: '#71717a',
    bgColor: 'bg-zinc-500/10',
    icon: Timer,
  },
};

// =============================================================================
// Helpers
// =============================================================================

function formatDaysActive(days: number | undefined): string {
  if (days === undefined || days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// =============================================================================
// Standup Issue Card - Larger, more detailed card for standups
// =============================================================================

interface StandupIssueCardProps {
  issue: SimpleIssue | CompletedIssue | BlockedIssue;
  status: StatusType;
  onClick?: () => void;
  showTime?: boolean;
}

function StandupIssueCard({ issue, status, onClick, showTime }: StandupIssueCardProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const completedIssue = issue as CompletedIssue;
  const blockedIssue = issue as BlockedIssue;

  // Get actual status label if available
  const statusLabel = issue.statusLabel || config.label;

  // Show days active for active statuses (not completed or planned)
  const showDaysActive = ['inProgress', 'inReview', 'blocked'].includes(status);
  const daysActive = issue.daysActive ?? 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group p-4 rounded-xl border cursor-pointer transition-all',
        'bg-[#0f0f10] border-[#1f1f23] hover:border-[#27272a] hover:bg-[#141416]'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status Indicator */}
        <div
          className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', config.bgColor)}
        >
          <Icon className="h-4 w-4" style={{ color: config.color }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-[#52525b]">{issue.key}</span>
            {/* Show actual status name */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${config.color}15`, color: config.color }}
            >
              {statusLabel}
            </span>
            {/* Show completion time for completed issues */}
            {showTime && completedIssue.completedAt && (
              <span className="text-[10px] text-emerald-400/70">
                {new Date(completedIssue.completedAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
            {/* Days in Status Badge - Always show for active statuses */}
            {showDaysActive && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
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
          <p className="text-sm text-[#e4e4e7] leading-snug mb-1">{issue.title}</p>

          {/* Blocked reason */}
          {blockedIssue.blockedBy && (
            <p className="text-[11px] text-red-400/70">
              Blocked by: {blockedIssue.blockedBy}
            </p>
          )}
          {blockedIssue.blockedReason && !blockedIssue.blockedBy && (
            <p className="text-[11px] text-red-400/70">
              {blockedIssue.blockedReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Collapsible Section - Improved clickability and visual clarity
// =============================================================================

interface CollapsibleSectionProps {
  icon: typeof Clock;
  iconColor: string;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  icon: Icon,
  iconColor,
  title,
  count,
  children,
  defaultExpanded = true
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (count === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all',
          'hover:bg-[#141416] active:bg-[#1a1a1c]',
          'border border-transparent hover:border-[#27272a]',
          'group cursor-pointer'
        )}
      >
        {/* Chevron indicator */}
        <div className={cn(
          'flex items-center justify-center w-6 h-6 rounded transition-colors',
          'bg-[#1f1f23] group-hover:bg-[#27272a]'
        )}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-[#71717a] group-hover:text-[#a1a1aa]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#71717a] group-hover:text-[#a1a1aa]" />
          )}
        </div>

        {/* Icon with color */}
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${iconColor}20` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
        </div>

        {/* Title */}
        <span className="text-sm font-medium text-[#e4e4e7] group-hover:text-white transition-colors">
          {title}
        </span>

        {/* Count badge */}
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            backgroundColor: `${iconColor}20`,
            color: iconColor,
          }}
        >
          {count}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand/collapse hint */}
        <span className="text-[11px] text-[#52525b] group-hover:text-[#71717a] transition-colors">
          {isExpanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="ml-9 mt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Expandable Issue List - For show more/less functionality
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
  initialLimit = 3
}: ExpandableIssueListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayedIssues = isExpanded ? issues : issues.slice(0, initialLimit);
  const remainingCount = issues.length - initialLimit;

  return (
    <>
      {displayedIssues.map((issue) => (
        <StandupIssueCard
          key={issue.id}
          issue={issue}
          status={status}
          onClick={() => onIssueClick(issue.id)}
        />
      ))}
      {remainingCount > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'w-full text-center py-3 rounded-xl border border-dashed transition-all',
            'border-[#27272a] hover:border-[#3f3f46] hover:bg-[#141416]',
            'text-sm font-medium text-[#71717a] hover:text-[#a1a1aa]'
          )}
        >
          {isExpanded ? (
            <span className="flex items-center justify-center gap-1.5">
              <ChevronUp className="h-4 w-4" />
              Show less
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <ChevronDown className="h-4 w-4" />
              Show {remainingCount} more
            </span>
          )}
        </button>
      )}
    </>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-4 text-center">
      <p className="text-sm text-[#52525b]">{message}</p>
    </div>
  );
}

// =============================================================================
// Member Standup Card - Full standup view for one member
// =============================================================================

interface MemberStandupProps {
  member: MemberActivity;
  onIssueClick: (id: string) => void;
}

function MemberStandup({ member, onIssueClick }: MemberStandupProps) {
  const { user, current, days } = member;
  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');
  const yesterday = getWorkingYesterday(today);
  const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
  const yesterdayLabel = getWorkingYesterdayLabel(today);

  const todayActivity = days[todayKey];
  const yesterdayActivity = days[yesterdayKey];

  // Get completed yesterday - look in yesterdayActivity for completions
  const completedYesterday = yesterdayActivity?.completed || [];

  // Get completed today from todayActivity
  const completedToday = todayActivity?.completed || [];

  // Get started today from todayActivity
  const startedToday = todayActivity?.started || [];

  return (
    <div className="h-full flex flex-col">
      {/* Member Header - Clean, without summary stats */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar className="h-16 w-16 ring-2 ring-[#27272a]">
          <AvatarImage src={user.image || undefined} />
          <AvatarFallback className="bg-[#27272a] text-xl text-[#fafafa]">
            {user.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-semibold text-[#fafafa]">{user.name}</h2>
      </div>

      {/* Standup Content - Two Column Layout */}
      <div className="flex-1 grid grid-cols-2 gap-8 min-h-0">
        {/* Left Column - What happened (Yesterday/Completed Today) */}
        <ScrollArea className="h-full">
          <div className="pr-4">
            {/* Yesterday Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4 px-3">
                <Calendar className="h-5 w-5 text-[#52525b]" />
                <h3 className="text-lg font-medium text-[#a1a1aa]">{yesterdayLabel}</h3>
              </div>

              {completedYesterday.length > 0 ? (
                <CollapsibleSection
                  icon={CheckCircle2}
                  iconColor="#22c55e"
                  title="Completed"
                  count={completedYesterday.length}
                >
                  {completedYesterday.map((issue) => (
                    <StandupIssueCard
                      key={issue.id}
                      issue={issue}
                      status="completed"
                      onClick={() => onIssueClick(issue.id)}
                      showTime
                    />
                  ))}
                </CollapsibleSection>
              ) : (
                <EmptyState message={`No completions on ${yesterdayLabel.toLowerCase()}`} />
              )}
            </div>

            {/* Completed Today Section */}
            {completedToday.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4 px-3">
                  <Calendar className="h-5 w-5 text-[#52525b]" />
                  <h3 className="text-lg font-medium text-[#a1a1aa]">Today</h3>
                </div>
                <CollapsibleSection
                  icon={CheckCircle2}
                  iconColor="#22c55e"
                  title="Already Completed"
                  count={completedToday.length}
                >
                  {completedToday.map((issue) => (
                    <StandupIssueCard
                      key={issue.id}
                      issue={issue}
                      status="completed"
                      onClick={() => onIssueClick(issue.id)}
                      showTime
                    />
                  ))}
                </CollapsibleSection>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Right Column - Current Work & Blockers */}
        <ScrollArea className="h-full">
          <div className="pr-4">
            {/* Blocked Section - Always first if present */}
            <CollapsibleSection
              icon={AlertTriangle}
              iconColor="#ef4444"
              title="Blocked"
              count={current.blocked.length}
            >
              {current.blocked.map((issue) => (
                <StandupIssueCard
                  key={issue.id}
                  issue={issue}
                  status="blocked"
                  onClick={() => onIssueClick(issue.id)}
                />
              ))}
            </CollapsibleSection>

            {/* In Review Section */}
            <CollapsibleSection
              icon={Eye}
              iconColor="#8b5cf6"
              title="Waiting for Review"
              count={current.inReview.length}
            >
              {current.inReview.map((issue) => (
                <StandupIssueCard
                  key={issue.id}
                  issue={issue}
                  status="inReview"
                  onClick={() => onIssueClick(issue.id)}
                />
              ))}
            </CollapsibleSection>

            {/* In Progress Section */}
            <CollapsibleSection
              icon={Clock}
              iconColor="#3b82f6"
              title="Working On"
              count={current.inProgress.length}
            >
              {current.inProgress.map((issue) => (
                <StandupIssueCard
                  key={issue.id}
                  issue={issue}
                  status="inProgress"
                  onClick={() => onIssueClick(issue.id)}
                />
              ))}
            </CollapsibleSection>

            {/* Up Next / Planned - with expandable list */}
            <CollapsibleSection
              icon={Timer}
              iconColor="#71717a"
              title="Up Next"
              count={current.planned.length}
              defaultExpanded={current.planned.length <= 5}
            >
              <ExpandableIssueList
                issues={current.planned}
                status="planned"
                onIssueClick={onIssueClick}
                initialLimit={3}
              />
            </CollapsibleSection>

            {/* Empty state if no current work */}
            {current.inProgress.length === 0 &&
              current.inReview.length === 0 &&
              current.blocked.length === 0 &&
              current.planned.length === 0 && (
                <EmptyState message="No active work" />
              )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// =============================================================================
// Main Standup View Component
// =============================================================================

export function StandupView({ members, onClose, onIssueClick }: StandupViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter out members with no activity
  const activeMembers = useMemo(() => {
    return members.filter(member => {
      return (
        member.summary.workload > 0 ||
        member.summary.completed > 0 ||
        Object.keys(member.days).length > 0
      );
    });
  }, [members]);

  const currentMember = activeMembers[currentIndex];
  const totalMembers = activeMembers.length;

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalMembers - 1));
  }, [totalMembers]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < totalMembers - 1 ? prev + 1 : 0));
  }, [totalMembers]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [goToPrevious, goToNext, onClose]
  );

  if (totalMembers === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#09090b] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[#71717a] mb-4">No team members with activity</p>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#09090b] flex flex-col"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f23]">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[#fafafa]">Daily Standup</h1>
          <span className="text-sm text-[#52525b]">
            {currentIndex + 1} of {totalMembers}
          </span>
        </div>

        {/* Member Navigation Pills */}
        <div className="flex items-center gap-2">
          {activeMembers.map((member, idx) => (
            <button
              key={member.user.id}
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                'relative transition-all',
                idx === currentIndex ? 'scale-110' : 'opacity-60 hover:opacity-100'
              )}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.user.image || undefined} />
                <AvatarFallback className="text-xs bg-[#27272a]">
                  {member.user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {member.hasBlockers && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-[#09090b]" />
              )}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-[#71717a] hover:text-[#fafafa]"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-stretch min-h-0">
        {/* Previous Button */}
        <button
          onClick={goToPrevious}
          className="w-16 flex items-center justify-center text-[#52525b] hover:text-[#fafafa] hover:bg-[#141416] transition-colors"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        {/* Member Content */}
        <div className="flex-1 p-8 min-h-0">
          {currentMember && (
            <MemberStandup member={currentMember} onIssueClick={onIssueClick} />
          )}
        </div>

        {/* Next Button */}
        <button
          onClick={goToNext}
          className="w-16 flex items-center justify-center text-[#52525b] hover:text-[#fafafa] hover:bg-[#141416] transition-colors"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-center gap-4 py-4 border-t border-[#1f1f23]">
        <Button
          variant="outline"
          onClick={goToPrevious}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <div className="flex items-center gap-1.5">
          {activeMembers.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                idx === currentIndex ? 'bg-blue-500 w-4' : 'bg-[#27272a] hover:bg-[#3f3f46]'
              )}
            />
          ))}
        </div>
        <Button
          variant="outline"
          onClick={goToNext}
          className="gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Keyboard hint */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-3 text-xs text-[#3f3f46]">
        <span className="px-1.5 py-0.5 rounded border border-[#27272a] font-mono">←</span>
        <span className="px-1.5 py-0.5 rounded border border-[#27272a] font-mono">→</span>
        <span>to navigate</span>
        <span className="px-1.5 py-0.5 rounded border border-[#27272a] font-mono">ESC</span>
        <span>to close</span>
      </div>
    </div>
  );
}

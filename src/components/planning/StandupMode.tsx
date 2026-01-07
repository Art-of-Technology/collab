'use client';

import { useState, useCallback, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import type { MemberActivity, SimpleIssue, BlockedIssue, CompletedIssue } from './types';

interface StandupModeProps {
  members: MemberActivity[];
  onClose: () => void;
  onIssueClick?: (issueId: string) => void;
}

// =============================================================================
// Standup Issue Item
// =============================================================================

interface StandupIssueProps {
  icon: typeof CheckCircle2;
  iconColor: string;
  issue: SimpleIssue | CompletedIssue | BlockedIssue;
  suffix?: string;
  onClick?: () => void;
}

function StandupIssue({ icon: Icon, iconColor, issue, suffix, onClick }: StandupIssueProps) {
  return (
    <div
      className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-[#1a1a1c] cursor-pointer transition-colors"
      onClick={onClick}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: iconColor }} />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] text-[#e4e4e7]">{issue.title}</span>
        {suffix && (
          <span className="text-[11px] text-[#52525b] ml-2">{suffix}</span>
        )}
      </div>
      <span className="text-[11px] text-[#52525b] font-mono flex-shrink-0">{issue.key}</span>
    </div>
  );
}

// =============================================================================
// Section Divider
// =============================================================================

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="h-px flex-1 bg-[#27272a]" />
      <span className="text-[11px] font-medium text-[#52525b] uppercase tracking-wider">{title}</span>
      <div className="h-px flex-1 bg-[#27272a]" />
    </div>
  );
}

// =============================================================================
// Progress Dots
// =============================================================================

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-2 rounded-full transition-colors',
            i === current ? 'bg-blue-500' : 'bg-[#27272a]'
          )}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function StandupMode({ members, onClose, onIssueClick }: StandupModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const member = members[currentIndex];

  const goNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % members.length);
  }, [members.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + members.length) % members.length);
  }, [members.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onClose]);

  if (!member) return null;

  // Get yesterday's activity
  const today = format(new Date(), 'yyyy-MM-dd');
  const sortedDays = Object.entries(member.days)
    .sort(([a], [b]) => b.localeCompare(a));

  const todayActivity = member.days[today];
  const yesterdayEntry = sortedDays.find(([key]) => {
    const date = parseISO(key);
    return isYesterday(date);
  });
  const yesterdayActivity = yesterdayEntry?.[1];

  // Collect yesterday's work
  const yesterdayItems: { issue: SimpleIssue | CompletedIssue; type: 'completed' | 'worked' }[] = [];
  if (yesterdayActivity) {
    yesterdayActivity.completed.forEach(issue => {
      yesterdayItems.push({ issue, type: 'completed' });
    });
    yesterdayActivity.started.forEach(issue => {
      yesterdayItems.push({ issue, type: 'worked' });
    });
    yesterdayActivity.movedToReview.forEach(issue => {
      if (!yesterdayItems.some(i => i.issue.id === issue.id)) {
        yesterdayItems.push({ issue, type: 'worked' });
      }
    });
  }

  // Today's work
  const todayWork = [
    ...member.current.inProgress,
    ...member.current.inReview,
  ];

  // Blockers
  const blockers = member.current.blocked;

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f1f23]">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[#fafafa]">Daily Standup</span>
          <span className="text-[13px] text-[#52525b]">{format(new Date(), 'MMM d, yyyy')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          {/* Member info */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <Avatar className="h-16 w-16">
              <AvatarImage src={member.user.image || undefined} />
              <AvatarFallback className="bg-[#27272a] text-[#fafafa] text-xl font-medium">
                {member.user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-semibold text-[#fafafa]">{member.user.name}</h2>
            <span className="text-[13px] text-[#52525b]">
              {currentIndex + 1} of {members.length} members
            </span>
          </div>

          {/* Standup content */}
          <div className="bg-[#0c0c0d] rounded-xl border border-[#1f1f23] p-6">
            {/* Yesterday */}
            <SectionDivider title="Yesterday I..." />
            {yesterdayItems.length > 0 ? (
              <div className="space-y-1">
                {yesterdayItems.map(({ issue, type }) => (
                  <StandupIssue
                    key={issue.id}
                    icon={type === 'completed' ? CheckCircle2 : Clock}
                    iconColor={type === 'completed' ? '#22c55e' : '#3b82f6'}
                    issue={issue}
                    suffix={type === 'completed' ? 'completed' : 'worked on'}
                    onClick={() => onIssueClick?.(issue.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#52525b] text-center py-4">No recorded activity</p>
            )}

            {/* Today */}
            <SectionDivider title="Today I will..." />
            {todayWork.length > 0 ? (
              <div className="space-y-1">
                {todayWork.map(issue => (
                  <StandupIssue
                    key={issue.id}
                    icon={Clock}
                    iconColor="#3b82f6"
                    issue={issue}
                    suffix={issue.daysActive ? `${issue.daysActive}d` : undefined}
                    onClick={() => onIssueClick?.(issue.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#52525b] text-center py-4">No assigned work</p>
            )}

            {/* Blockers */}
            {blockers.length > 0 && (
              <>
                <SectionDivider title="Blockers" />
                <div className="space-y-1">
                  {blockers.map(issue => (
                    <StandupIssue
                      key={issue.id}
                      icon={AlertTriangle}
                      iconColor="#ef4444"
                      issue={issue}
                      suffix={issue.blockedBy ? `by ${issue.blockedBy}` : undefined}
                      onClick={() => onIssueClick?.(issue.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Progress dots */}
          <ProgressDots current={currentIndex} total={members.length} />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f1f23]">
        <Button
          variant="ghost"
          onClick={goPrev}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        <span className="text-[11px] text-[#52525b]">
          Use arrow keys or space to navigate
        </span>

        <Button
          variant="ghost"
          onClick={goNext}
          className="gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

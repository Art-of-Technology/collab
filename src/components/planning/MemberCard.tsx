'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronRight, AlertTriangle, CheckCircle2, Clock, Eye, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MemberActivity } from './types';
import { getWorkloadLevel } from './types';

interface MemberCardProps {
  member: MemberActivity;
  isExpanded?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
}

// =============================================================================
// Workload Progress Bar
// =============================================================================

function WorkloadBar({ workload }: { workload: number }) {
  const level = getWorkloadLevel(workload);
  const percentage = Math.min((workload / 10) * 100, 100);

  const colorClass = {
    low: 'bg-emerald-500',
    medium: 'bg-blue-500',
    high: 'bg-amber-500',
    overloaded: 'bg-red-500',
  }[level];

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-[#52525b] font-medium w-4">{workload}</span>
    </div>
  );
}

// =============================================================================
// Status Badge
// =============================================================================

interface StatusBadgeProps {
  icon: typeof CheckCircle2;
  count: number;
  color: string;
  bgColor: string;
}

function StatusBadge({ icon: Icon, count, color, bgColor }: StatusBadgeProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', bgColor)}
      style={{ color }}
    >
      <Icon className="h-3 w-3" />
      <span>{count}</span>
    </div>
  );
}

// =============================================================================
// Member Card
// =============================================================================

export function MemberCard({ member, isExpanded, onToggle, onClick }: MemberCardProps) {
  const { user, summary, todayHighlight, hasBlockers, warnings } = member;
  const hasWarnings = warnings.length > 0;

  return (
    <div
      className={cn(
        'bg-[#0c0c0d] rounded-lg border border-[#1f1f23] overflow-hidden transition-colors',
        hasBlockers && 'border-red-500/20'
      )}
    >
      {/* Header - Always visible */}
      <button
        onClick={onClick || onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#141416] transition-colors"
      >
        {/* Avatar */}
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarImage src={user.image || undefined} />
          <AvatarFallback className="bg-[#27272a] text-[#fafafa] text-sm font-medium">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Name and warnings */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <span className="text-[13px] font-medium text-[#fafafa] truncate max-w-[140px]">
            {user.name}
          </span>
          {hasWarnings && (
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/10">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] text-amber-400 font-medium">{warnings.length}</span>
            </div>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <StatusBadge
            icon={CheckCircle2}
            count={summary.completed}
            color="#22c55e"
            bgColor="bg-emerald-500/10"
          />
          <StatusBadge
            icon={Clock}
            count={summary.inProgress}
            color="#3b82f6"
            bgColor="bg-blue-500/10"
          />
          <StatusBadge
            icon={Eye}
            count={summary.inReview}
            color="#8b5cf6"
            bgColor="bg-violet-500/10"
          />
          <StatusBadge
            icon={AlertCircle}
            count={summary.blocked}
            color="#ef4444"
            bgColor="bg-red-500/10"
          />
        </div>

        {/* Workload bar */}
        <WorkloadBar workload={summary.workload} />

        {/* Chevron */}
        <ChevronRight
          className={cn(
            'h-4 w-4 text-[#52525b] transition-transform flex-shrink-0',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* Today highlight - subtle */}
      {todayHighlight && (
        <div className="px-4 pb-2 -mt-1">
          <p className="text-[11px] text-[#52525b] truncate pl-12">
            {todayHighlight}
          </p>
        </div>
      )}
    </div>
  );
}

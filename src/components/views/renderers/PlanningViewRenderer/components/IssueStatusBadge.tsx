"use client";

import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusCategory, MovementType } from '@/utils/teamSyncAnalyzer';

// ============================================================================
// Status Configuration
// ============================================================================

export type PlanningStatus = 
  | 'completed'
  | 'in_progress'
  | 'in_review'
  | 'planned'
  | 'blocked'
  | 'carried_over'
  | 'started';

const STATUS_CONFIG: Record<string, {
  label: string;
  dotColor: string;
  textColor: string;
}> = {
  completed: {
    label: 'Completed',
    dotColor: 'bg-emerald-500',
    textColor: 'text-emerald-400',
  },
  in_progress: {
    label: 'In Progress',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-400',
  },
  in_review: {
    label: 'In Review',
    dotColor: 'bg-purple-500',
    textColor: 'text-purple-400',
  },
  planned: {
    label: 'Planned',
    dotColor: 'bg-slate-500',
    textColor: 'text-slate-400',
  },
  blocked: {
    label: 'Blocked',
    dotColor: 'bg-red-500',
    textColor: 'text-red-400',
  },
  carried_over: {
    label: 'Carried Over',
    dotColor: 'bg-orange-500',
    textColor: 'text-orange-400',
  },
  started: {
    label: 'Started',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-400',
  },
};

// ============================================================================
// StatusDot - Simple colored dot
// ============================================================================

interface StatusDotProps {
  status: PlanningStatus | StatusCategory | string;
  size?: 'xs' | 'sm' | 'md';
}

export function StatusDot({ status, size = 'sm' }: StatusDotProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  
  const sizeClasses = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
  };

  return (
    <span className={cn(
      "inline-block rounded-full flex-shrink-0",
      config.dotColor,
      sizeClasses[size]
    )} />
  );
}

// ============================================================================
// Movement Badge - For activity feed
// ============================================================================

const MOVEMENT_CONFIG: Record<MovementType, typeof STATUS_CONFIG[string]> = {
  completed: STATUS_CONFIG.completed,
  started: STATUS_CONFIG.started,
  moved_to_review: STATUS_CONFIG.in_review,
  blocked: STATUS_CONFIG.blocked,
  unblocked: {
    label: 'Unblocked',
    dotColor: 'bg-amber-500',
    textColor: 'text-amber-400',
  },
  assigned: {
    label: 'Assigned',
    dotColor: 'bg-indigo-500',
    textColor: 'text-indigo-400',
  },
  created: {
    label: 'Created',
    dotColor: 'bg-gray-500',
    textColor: 'text-gray-400',
  },
};

interface MovementBadgeProps {
  movementType: MovementType;
  showLabel?: boolean;
}

export function MovementBadge({ movementType, showLabel = true }: MovementBadgeProps) {
  const config = MOVEMENT_CONFIG[movementType] || MOVEMENT_CONFIG.started;
  
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
      "bg-[#181818] border border-[#2d2d30]"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
      {showLabel && (
        <span className={cn("text-xs font-medium", config.textColor)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Legacy/Helper exports
// ============================================================================

export function emojiToStatusCategory(emoji: string): StatusCategory {
  switch (emoji) {
    case '✅': return 'completed';
    case '💼': return 'in_progress';
    case '🔍': return 'in_review';
    case '🎯': return 'planned';
    case '🚫': 
    case '⛔️': return 'blocked';
    default: return 'planned';
  }
}

export function StatusTransition({ from, to }: { from: string | null; to: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {from && (
        <>
          <span className="text-[#6e7681] text-xs truncate max-w-[80px]">{from}</span>
          <ArrowRight className="h-3 w-3 text-[#484f58] flex-shrink-0" />
        </>
      )}
      <span className="text-[#e6edf3] text-xs truncate max-w-[80px]">{to}</span>
    </div>
  );
}

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.planned;
}

// Backward compatibility exports
export const IssueStatusBadge = StatusDot;
export const StatusIcon = StatusDot;
export const StatusPill = StatusDot;
export const StatusLegend = () => null; // Removed - not needed

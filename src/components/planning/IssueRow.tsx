'use client';

import { cn } from '@/lib/utils';
import { Clock, AlertTriangle } from 'lucide-react';
import type { SimpleIssue, CompletedIssue, BlockedIssue } from './types';
import { getPriorityColor, formatDaysActive } from './types';

// =============================================================================
// Priority Dot
// =============================================================================

function PriorityDot({ priority }: { priority: string }) {
  const color = getPriorityColor(priority);
  return (
    <div
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

// =============================================================================
// Base Issue Row
// =============================================================================

interface IssueRowProps {
  issue: SimpleIssue;
  onClick?: () => void;
  showDaysActive?: boolean;
  className?: string;
}

export function IssueRow({ issue, onClick, showDaysActive = true, className }: IssueRowProps) {
  const hasWarning = issue.daysActive !== undefined && issue.daysActive >= 5;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#1a1a1c] cursor-pointer transition-colors',
        className
      )}
      onClick={onClick}
    >
      <PriorityDot priority={issue.priority} />

      <span className="text-[#71717a] text-xs font-mono flex-shrink-0 w-[72px]">
        {issue.key}
      </span>

      <span className="flex-1 text-[#e4e4e7] text-[13px] truncate">
        {issue.title}
      </span>

      {showDaysActive && issue.daysActive !== undefined && (
        <span
          className={cn(
            'flex items-center gap-1 text-[10px] flex-shrink-0',
            hasWarning ? 'text-amber-400' : 'text-[#52525b]'
          )}
        >
          <Clock className="h-3 w-3" />
          {formatDaysActive(issue.daysActive)}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Completed Issue Row
// =============================================================================

interface CompletedIssueRowProps {
  issue: CompletedIssue;
  onClick?: () => void;
  className?: string;
}

export function CompletedIssueRow({ issue, onClick, className }: CompletedIssueRowProps) {
  const time = new Date(issue.completedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#1a1a1c] cursor-pointer transition-colors',
        className
      )}
      onClick={onClick}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />

      <span className="text-[#71717a] text-xs font-mono flex-shrink-0 w-[72px]">
        {issue.key}
      </span>

      <span className="flex-1 text-[#a1a1aa] text-[13px] truncate line-through decoration-[#52525b]">
        {issue.title}
      </span>

      <span className="text-[10px] text-emerald-400/70 flex-shrink-0">
        {time}
      </span>
    </div>
  );
}

// =============================================================================
// Blocked Issue Row
// =============================================================================

interface BlockedIssueRowProps {
  issue: BlockedIssue;
  onClick?: () => void;
  className?: string;
}

export function BlockedIssueRow({ issue, onClick, className }: BlockedIssueRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-red-500/5 cursor-pointer transition-colors',
        className
      )}
      onClick={onClick}
    >
      <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />

      <span className="text-[#71717a] text-xs font-mono flex-shrink-0 w-[72px]">
        {issue.key}
      </span>

      <span className="flex-1 text-[#e4e4e7] text-[13px] truncate">
        {issue.title}
      </span>

      {issue.blockedBy && (
        <span className="text-[10px] text-red-400/70 flex-shrink-0">
          blocked by {issue.blockedBy}
        </span>
      )}
    </div>
  );
}

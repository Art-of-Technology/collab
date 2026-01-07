"use client";

import { CheckCircle2, Circle, PlayCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusCategory = 'done' | 'in_progress' | 'todo' | 'blocked' | 'cancelled' | 'unknown';

interface StatusIconProps {
  status: StatusCategory;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const statusConfig: Record<StatusCategory, { icon: typeof Circle; color: string }> = {
  done: { icon: CheckCircle2, color: 'text-green-500' },
  in_progress: { icon: PlayCircle, color: 'text-blue-500' },
  todo: { icon: Circle, color: 'text-gray-400' },
  blocked: { icon: AlertCircle, color: 'text-red-500' },
  cancelled: { icon: XCircle, color: 'text-gray-500' },
  unknown: { icon: Clock, color: 'text-gray-400' },
};

export function StatusIcon({ status, size = 'md', className }: StatusIconProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  const Icon = config.icon;

  return (
    <Icon className={cn(sizeMap[size], config.color, className)} />
  );
}

export function emojiToStatusCategory(emoji?: string | null): StatusCategory {
  if (!emoji) return 'unknown';

  // Map common status emojis to categories
  const emojiMap: Record<string, StatusCategory> = {
    '✅': 'done',
    '🟢': 'done',
    '☑️': 'done',
    '🔵': 'in_progress',
    '🏃': 'in_progress',
    '⚡': 'in_progress',
    '🔄': 'in_progress',
    '⚪': 'todo',
    '📋': 'todo',
    '🔴': 'blocked',
    '🚫': 'blocked',
    '⛔': 'blocked',
    '❌': 'cancelled',
    '🗑️': 'cancelled',
  };

  return emojiMap[emoji] || 'unknown';
}

export function getStatusConfig(status: StatusCategory) {
  return statusConfig[status] || statusConfig.unknown;
}

interface IssueStatusBadgeProps {
  status: string;
  statusSymbol?: string | null;
  className?: string;
}

export function IssueStatusBadge({ status, statusSymbol, className }: IssueStatusBadgeProps) {
  const category = emojiToStatusCategory(statusSymbol);
  const config = statusConfig[category];

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <StatusIcon status={category} size="sm" />
      <span className="text-xs text-gray-400">{status}</span>
    </div>
  );
}

export function StatusDot({ status }: { status: StatusCategory }) {
  const config = statusConfig[status] || statusConfig.unknown;
  return (
    <div className={cn('h-2 w-2 rounded-full', config.color.replace('text-', 'bg-'))} />
  );
}

export function MovementBadge({ direction }: { direction: 'forward' | 'backward' | 'none' }) {
  if (direction === 'none') return null;

  return (
    <span className={cn(
      'text-[10px] px-1 py-0.5 rounded',
      direction === 'forward' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
    )}>
      {direction === 'forward' ? '→' : '←'}
    </span>
  );
}

export function StatusTransition({ from, to }: { from: StatusCategory; to: StatusCategory }) {
  return (
    <div className="flex items-center gap-1">
      <StatusIcon status={from} size="sm" />
      <span className="text-gray-500">→</span>
      <StatusIcon status={to} size="sm" />
    </div>
  );
}

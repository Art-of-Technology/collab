"use client";

import { getStatusConfig, ReflectionStatus } from '@/utils/dailyFocusHelpers';
import { cn } from '@/lib/utils';

interface IssueStatusBadgeProps {
  status: ReflectionStatus;
  variant?: 'default' | 'compact' | 'inline';
  showLabel?: boolean;
  className?: string;
}

export function IssueStatusBadge({
  status,
  variant = 'default',
  showLabel = true,
  className,
}: IssueStatusBadgeProps) {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = {
    default: 'h-5 px-2 text-xs',
    compact: 'h-4 px-1.5 text-[10px]',
    inline: 'h-3.5 px-1 text-[9px]',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md font-medium border-0',
        config.bgColor,
        sizeClasses[variant],
        className
      )}
      style={{ color: config.color }}
    >
      <Icon className={cn(
        variant === 'default' ? 'h-3.5 w-3.5' : variant === 'compact' ? 'h-3 w-3' : 'h-2.5 w-2.5'
      )} />
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}



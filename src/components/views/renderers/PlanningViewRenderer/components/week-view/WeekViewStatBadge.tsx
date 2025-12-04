"use client";

import { cn } from '@/lib/utils';

export type StatBadgeColor = 'emerald' | 'blue' | 'violet' | 'slate' | 'amber' | 'orange' | 'purple';

interface WeekViewStatBadgeProps {
  count: number;
  label: string;
  color: StatBadgeColor;
}

const colorStyles: Record<StatBadgeColor, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  slate: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export function WeekViewStatBadge({ count, label, color }: WeekViewStatBadgeProps) {
  if (count === 0) return null;

  return (
    <div className={cn(
      "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border",
      colorStyles[color]
    )}>
      <span>{count}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}


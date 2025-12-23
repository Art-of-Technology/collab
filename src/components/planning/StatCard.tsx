'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Eye, AlertTriangle, ListTodo } from 'lucide-react';

type StatType = 'completed' | 'inProgress' | 'inReview' | 'blocked' | 'planned';

interface StatCardProps {
  type: StatType;
  value: number;
  subValue?: number;
  subLabel?: string;
  className?: string;
}

const CONFIG: Record<StatType, {
  label: string;
  icon: typeof CheckCircle2;
  bgClass: string;
  iconClass: string;
  valueClass: string;
}> = {
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    bgClass: 'bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10',
    iconClass: 'text-emerald-500',
    valueClass: 'text-emerald-400',
  },
  inProgress: {
    label: 'In Progress',
    icon: Clock,
    bgClass: 'bg-blue-500/5 border-blue-500/10 hover:bg-blue-500/10',
    iconClass: 'text-blue-500',
    valueClass: 'text-blue-400',
  },
  inReview: {
    label: 'In Review',
    icon: Eye,
    bgClass: 'bg-violet-500/5 border-violet-500/10 hover:bg-violet-500/10',
    iconClass: 'text-violet-500',
    valueClass: 'text-violet-400',
  },
  blocked: {
    label: 'Blocked',
    icon: AlertTriangle,
    bgClass: 'bg-red-500/5 border-red-500/10 hover:bg-red-500/10',
    iconClass: 'text-red-500',
    valueClass: 'text-red-400',
  },
  planned: {
    label: 'Planned',
    icon: ListTodo,
    bgClass: 'bg-slate-500/5 border-slate-500/10 hover:bg-slate-500/10',
    iconClass: 'text-slate-400',
    valueClass: 'text-slate-300',
  },
};

export function StatCard({ type, value, subValue, subLabel, className }: StatCardProps) {
  const config = CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex flex-col gap-1 p-4 rounded-lg border transition-colors',
        config.bgClass,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className={cn('h-4 w-4', config.iconClass)} />
        {subValue !== undefined && subValue > 0 && (
          <span className="text-[10px] text-emerald-400 font-medium">
            +{subValue} {subLabel || 'today'}
          </span>
        )}
      </div>
      <div className={cn('text-2xl font-semibold', config.valueClass)}>
        {value}
      </div>
      <div className="text-xs text-[#71717a]">
        {config.label}
      </div>
    </div>
  );
}

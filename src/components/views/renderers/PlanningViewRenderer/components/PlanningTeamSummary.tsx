"use client";

import { useMemo } from 'react';
import { 
  CheckCircle2, 
  PlayCircle, 
  Clock, 
  Eye, 
  ListTodo,
  Activity,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamRangeSummary } from '../types';
import { format } from 'date-fns';

interface PlanningTeamSummaryProps {
  summary: TeamRangeSummary;
  dateRange: { startDate: string; endDate: string };
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  suffix?: string;
}

function StatCard({ label, value, icon, color, bgColor, suffix }: StatCardProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors",
      "bg-[#141414] border-[#252525] hover:border-[#333]"
    )}>
      <div className={cn(
        "flex items-center justify-center w-10 h-10 rounded-lg",
        bgColor
      )}>
        <div className={color}>{icon}</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-white">
          {value}
          {suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
        </div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  );
}

export function PlanningTeamSummary({
  summary,
  dateRange,
  isCollapsed = false,
  onToggleCollapse,
}: PlanningTeamSummaryProps) {
  const isSingleDay = dateRange.startDate === dateRange.endDate;
  
  const dateLabel = useMemo(() => {
    if (isSingleDay) {
      return format(new Date(dateRange.startDate), 'EEEE, MMMM d, yyyy');
    }
    return `${format(new Date(dateRange.startDate), 'MMM d')} - ${format(new Date(dateRange.endDate), 'MMM d, yyyy')}`;
  }, [dateRange, isSingleDay]);

  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="w-full px-6 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-gray-300 hover:bg-[#151515] transition-colors border-b border-[#1a1a1a]"
      >
        <span className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          <span>{dateLabel}</span>
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {summary.totalCompleted}
          </span>
          <span className="flex items-center gap-1.5">
            <PlayCircle className="h-3 w-3 text-blue-400" />
            {summary.totalStarted}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-amber-400" />
            {summary.totalInProgress}
          </span>
          <span className="text-gray-500">Click to expand</span>
        </div>
      </button>
    );
  }

  return (
    <div className="px-6 py-4 border-b border-[#1a1a1a] bg-[#0c0c0c]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#6366f1]" />
            <span className="text-sm font-medium text-white">{dateLabel}</span>
          </div>
          {summary.teamCompletionRate > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-emerald-400">{summary.teamCompletionRate}% completion rate</span>
            </div>
          )}
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Collapse
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Completed"
          value={summary.totalCompleted}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Started"
          value={summary.totalStarted}
          icon={<PlayCircle className="h-5 w-5" />}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          label="In Progress"
          value={summary.totalInProgress}
          icon={<Clock className="h-5 w-5" />}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          label="In Review"
          value={summary.totalInReview}
          icon={<Eye className="h-5 w-5" />}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <StatCard
          label="Planned"
          value={summary.totalPlanned}
          icon={<ListTodo className="h-5 w-5" />}
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
        />
        <StatCard
          label="Movements"
          value={summary.totalMovements}
          icon={<Activity className="h-5 w-5" />}
          color="text-orange-400"
          bgColor="bg-orange-500/10"
        />
      </div>

      {/* Most Active Day indicator (only show for multi-day ranges) */}
      {!isSingleDay && summary.mostActiveDay && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <Activity className="h-3 w-3" />
          <span>
            Most active: {format(new Date(summary.mostActiveDay), 'EEEE, MMM d')}
          </span>
        </div>
      )}
    </div>
  );
}


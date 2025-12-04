"use client";

import { useMemo, useState } from 'react';
import { 
  Activity,
  CheckCircle2,
  PlayCircle,
  Eye,
  AlertTriangle,
  Unlock,
  UserPlus,
  Plus,
  ArrowRight,
  Zap,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import type { IssueMovement, MovementType } from '../types';
import { format, isToday, isYesterday, differenceInMinutes } from 'date-fns';

// ============================================================================
// Types & Config
// ============================================================================

interface PlanningActivityFeedProps {
  activities: IssueMovement[];
  workspaceSlug: string;
  isLoading?: boolean;
}

const ACTIVITY_CONFIG: Record<MovementType, {
  label: string;
  verb: string;
  color: string;
  bgColor: string;
  ringColor: string;
  icon: typeof CheckCircle2;
}> = {
  completed: {
    label: 'Completed',
    verb: 'completed',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500',
    ringColor: 'ring-emerald-500/20',
    icon: CheckCircle2,
  },
  started: {
    label: 'Started',
    verb: 'started working on',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500',
    ringColor: 'ring-blue-500/20',
    icon: PlayCircle,
  },
  moved_to_review: {
    label: 'In Review',
    verb: 'sent to review',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500',
    ringColor: 'ring-violet-500/20',
    icon: Eye,
  },
  blocked: {
    label: 'Blocked',
    verb: 'blocked',
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    ringColor: 'ring-red-500/20',
    icon: AlertTriangle,
  },
  unblocked: {
    label: 'Unblocked',
    verb: 'unblocked',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500',
    ringColor: 'ring-teal-500/20',
    icon: Unlock,
  },
  assigned: {
    label: 'Assigned',
    verb: 'was assigned to',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500',
    ringColor: 'ring-sky-500/20',
    icon: UserPlus,
  },
  created: {
    label: 'Created',
    verb: 'created',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500',
    ringColor: 'ring-slate-500/20',
    icon: Plus,
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'text-red-400 bg-red-500/10',
  HIGH: 'text-orange-400 bg-orange-500/10',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10',
  LOW: 'text-slate-400 bg-slate-500/10',
};

// ============================================================================
// Time Marker Component
// ============================================================================

function TimeMarker({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-20 flex justify-end pr-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium text-[#3f3f46] uppercase tracking-wider">
            {label}
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#3f3f46] flex-shrink-0" />
        </div>
      </div>
      <div className="flex-1 h-px bg-gradient-to-r from-[#27272a] to-transparent" />
    </div>
  );
}

// ============================================================================
// Timeline Item Component
// ============================================================================

interface TimelineItemProps {
  activity: IssueMovement;
  isFirst: boolean;
  isLast: boolean;
  onOpenModal: (issueId: string) => void;
}

function TimelineItem({ activity, isFirst, isLast, onOpenModal }: TimelineItemProps) {
  const config = ACTIVITY_CONFIG[activity.movementType] || ACTIVITY_CONFIG.created;
  const Icon = config.icon;
  const time = new Date(activity.movedAt);
  const exactTime = format(time, 'h:mm a');
  const priorityStyle = activity.priority ? PRIORITY_COLORS[activity.priority.toUpperCase()] : null;

  return (
    <div className="flex gap-3 group">
      {/* Timeline track with time */}
      <div className="w-20 flex flex-col items-end pr-2">
        {/* Connector line - top */}
        <div className={cn(
          "w-px flex-1 min-h-2 mr-[11px]",
          isFirst ? "bg-transparent" : "bg-[#27272a]"
        )} />
        
        {/* Time + Icon row */}
        <div className="flex items-center gap-1.5">
          <div className="text-[10px] text-[#52525b] group-hover:text-[#71717a] transition-colors">
            {exactTime}
          </div>
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center ring-2 transition-all flex-shrink-0",
            config.bgColor,
            config.ringColor,
            "group-hover:ring-4"
          )}>
            <Icon className="h-3 w-3 text-white" />
          </div>
        </div>
        
        {/* Connector line - bottom */}
        <div className={cn(
          "w-px flex-1 min-h-2 mr-[11px]",
          isLast ? "bg-transparent" : "bg-[#27272a]"
        )} />
      </div>

      {/* Content card - compact */}
      <div 
        className={cn(
          "flex-1 mb-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
          "bg-[#0c0c0d] border-[#1f1f23]",
          "hover:bg-[#111113] hover:border-[#27272a]"
        )}
        onClick={() => onOpenModal(activity.issueId)}
      >
        {/* Single row: Key + Title + Meta */}
        <div className="flex items-center gap-2">
          {/* Issue key */}
          <span className="text-[10px] font-mono text-[#52525b] flex-shrink-0">
            {activity.issueKey}
          </span>
          
          {/* Title */}
          <span className="flex-1 text-[13px] text-[#e4e4e7] truncate group-hover:text-white transition-colors">
            {activity.title}
          </span>
          
          {/* Priority */}
          {priorityStyle && (
            <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0", priorityStyle)}>
              {activity.priority?.charAt(0)}
            </span>
          )}
        </div>

        {/* Second row: Status transition + User + Project */}
        <div className="flex items-center gap-2 mt-1.5">
          {/* Status transition */}
          {activity.fromStatus && activity.toStatus && (
            <span className="flex items-center gap-1 text-[10px]">
              <span className="text-[#3f3f46]">{activity.fromStatusDisplayName || activity.fromStatus}</span>
              <ArrowRight className="h-2.5 w-2.5 text-[#27272a]" />
              <span className={config.color}>{activity.toStatusDisplayName || activity.toStatus}</span>
            </span>
          )}
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* User */}
          {activity.userName && (
            <div className="flex items-center gap-1">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="bg-[#27272a] text-[8px] text-[#71717a]">
                  {activity.userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-[#52525b]">{activity.userName}</span>
            </div>
          )}
          
          {/* Project */}
          {activity.projectName && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#18181b] text-[#3f3f46]">
              {activity.projectName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Filter Pill Component
// ============================================================================

interface FilterPillProps {
  type: MovementType;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function FilterPill({ type, count, isActive, onClick }: FilterPillProps) {
  const config = ACTIVITY_CONFIG[type];
  if (count === 0) return null;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all border",
        isActive
          ? `${config.bgColor} text-white border-transparent shadow-lg`
          : "bg-[#0f0f10] text-[#71717a] border-[#27272a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"
      )}
    >
      <config.icon className="h-3 w-3" />
      <span>{count}</span>
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlanningActivityFeed({
  activities,
  workspaceSlug,
  isLoading = false,
}: PlanningActivityFeedProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<MovementType | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const s: Record<MovementType, number> = {
      completed: 0,
      started: 0,
      moved_to_review: 0,
      blocked: 0,
      unblocked: 0,
      assigned: 0,
      created: 0,
    };
    activities.forEach(a => { s[a.movementType]++; });
    return s;
  }, [activities]);

  // Filter and group activities
  const { filteredActivities, timeGroups } = useMemo(() => {
    // Filter
    const filtered = activeFilter 
      ? activities.filter(a => a.movementType === activeFilter)
      : activities;

    // Group by time proximity
    const groups: { label: string; startIdx: number }[] = [];
    let lastDate: Date | null = null;
    let lastLabel: string | null = null;

    filtered.forEach((activity, idx) => {
      const date = new Date(activity.movedAt);
      let label: string;

      if (isToday(date)) {
        const mins = differenceInMinutes(new Date(), date);
        if (mins < 60) {
          label = 'Just now';
        } else if (mins < 180) {
          label = 'Earlier today';
        } else {
          label = 'Today';
        }
      } else if (isYesterday(date)) {
        label = 'Yesterday';
      } else {
        label = format(date, 'EEEE, MMM d');
      }

      if (label !== lastLabel) {
        groups.push({ label, startIdx: idx });
        lastLabel = label;
      }
      lastDate = date;
    });

    return { filteredActivities: filtered, timeGroups: groups };
  }, [activities, activeFilter]);

  // Toggle filter
  const toggleFilter = (type: MovementType) => {
    setActiveFilter(current => current === type ? null : type);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-[#27272a]" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
            <Activity className="absolute inset-0 m-auto h-5 w-5 text-[#3f3f46]" />
          </div>
          <p className="text-[13px] text-[#52525b]">Loading timeline...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (activities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#18181b] to-[#0f0f10] flex items-center justify-center mx-auto mb-4 border border-[#27272a]">
            <Zap className="h-7 w-7 text-[#3f3f46]" />
          </div>
          <p className="text-[15px] font-medium text-[#fafafa] mb-2">No activity yet</p>
          <p className="text-[13px] text-[#52525b] leading-relaxed">
            When team members complete, start, or update issues, their activity will appear here in real-time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-[#1f1f23] bg-[#09090b]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-[#fafafa]">Activity Timeline</h2>
                <p className="text-[11px] text-[#52525b]">{activities.length} activities</p>
              </div>
            </div>
            
            {activeFilter && (
              <button
                onClick={() => setActiveFilter(null)}
                className="flex items-center gap-1.5 text-[11px] text-[#71717a] hover:text-[#a1a1aa] px-2 py-1 rounded-md hover:bg-[#18181b] transition-colors"
              >
                <Filter className="h-3 w-3" />
                Clear filter
              </button>
            )}
          </div>
          
          {/* Filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              type="completed"
              count={stats.completed}
              isActive={activeFilter === 'completed'}
              onClick={() => toggleFilter('completed')}
            />
            <FilterPill
              type="moved_to_review"
              count={stats.moved_to_review}
              isActive={activeFilter === 'moved_to_review'}
              onClick={() => toggleFilter('moved_to_review')}
            />
            <FilterPill
              type="started"
              count={stats.started}
              isActive={activeFilter === 'started'}
              onClick={() => toggleFilter('started')}
            />
            <FilterPill
              type="blocked"
              count={stats.blocked}
              isActive={activeFilter === 'blocked'}
              onClick={() => toggleFilter('blocked')}
            />
            <FilterPill
              type="assigned"
              count={stats.assigned}
              isActive={activeFilter === 'assigned'}
              onClick={() => toggleFilter('assigned')}
            />
            <FilterPill
              type="created"
              count={stats.created}
              isActive={activeFilter === 'created'}
              onClick={() => toggleFilter('created')}
            />
          </div>
        </div>
        
        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredActivities.map((activity, idx) => {
            // Check if we need a time marker
            const timeGroup = timeGroups.find(g => g.startIdx === idx);
            const isFirst = idx === 0;
            const isLast = idx === filteredActivities.length - 1;

            return (
              <div key={`${activity.issueId}-${activity.movedAt}-${idx}`}>
                {timeGroup && (
                  <TimeMarker label={timeGroup.label} />
                )}
                <TimelineItem
                  activity={activity}
                  isFirst={isFirst && !timeGroup}
                  isLast={isLast}
                  onOpenModal={setSelectedIssueId}
                />
              </div>
            );
          })}
          
          {/* End of timeline */}
          <div className="flex items-center gap-3 pt-2 pb-6">
            <div className="w-20 flex justify-end pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-[#3f3f46]">End</span>
                <div className="w-2 h-2 rounded-full bg-[#1a1a1d] border border-[#27272a] flex-shrink-0" />
              </div>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-[#27272a] to-transparent" />
          </div>
        </div>
      </div>

      {/* Issue Detail Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </>
  );
}

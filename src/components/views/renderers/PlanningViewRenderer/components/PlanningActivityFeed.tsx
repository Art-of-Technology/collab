"use client";

import { useMemo, useState } from 'react';
import { 
  Activity,
  CheckCircle2,
  Play,
  Eye,
  AlertTriangle,
  Unlock,
  UserPlus,
  Plus,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import type { IssueMovement, MovementType } from '../types';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

interface PlanningActivityFeedProps {
  activities: IssueMovement[];
  workspaceSlug: string;
  isLoading?: boolean;
}

interface ActivityItemProps {
  activity: IssueMovement;
  workspaceSlug: string;
  onOpenModal: (issueId: string) => void;
}

// Movement indicator - minimal dot style
const getMovementStyle = (type: MovementType) => {
  switch (type) {
    case 'completed': return { color: 'bg-emerald-500', icon: CheckCircle2 };
    case 'started': return { color: 'bg-blue-500', icon: Play };
    case 'moved_to_review': return { color: 'bg-violet-500', icon: Eye };
    case 'blocked': return { color: 'bg-red-500', icon: AlertTriangle };
    case 'unblocked': return { color: 'bg-emerald-500', icon: Unlock };
    case 'assigned': return { color: 'bg-blue-500', icon: UserPlus };
    case 'created': return { color: 'bg-slate-500', icon: Plus };
    default: return { color: 'bg-slate-500', icon: Activity };
  }
};

// Priority indicator
const PriorityIndicator = ({ priority }: { priority: string }) => {
  const p = priority?.toUpperCase();
  if (p === 'URGENT') return <AlertTriangle className="h-3 w-3 text-red-500" />;
  if (p === 'HIGH') return <ArrowUp className="h-3 w-3 text-orange-500" />;
  if (p === 'LOW') return <ArrowDown className="h-3 w-3 text-slate-400" />;
  return null;
};

function ActivityItem({ activity, workspaceSlug, onOpenModal }: ActivityItemProps) {
  const timeAgo = formatDistanceToNow(new Date(activity.movedAt), { addSuffix: true });
  const movement = getMovementStyle(activity.movementType);
  
  return (
    <div 
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[#18181b] cursor-pointer transition-colors"
      onClick={() => onOpenModal(activity.issueId)}
    >
      {/* Movement dot */}
      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", movement.color)} />

      {/* Issue key */}
      <span className="text-[#71717a] text-xs font-mono flex-shrink-0 w-16">
        {activity.issueKey}
      </span>

      {/* Title */}
      <span className="flex-1 text-[#fafafa] text-[13px] truncate group-hover:text-[#a1a1aa] transition-colors">
        {activity.title}
      </span>

      {/* Right side */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Priority */}
        {activity.priority && <PriorityIndicator priority={activity.priority} />}

        {/* Project */}
        {activity.projectName && (
          <span className="text-[11px] text-[#52525b] max-w-[100px] truncate">
            {activity.projectName}
          </span>
        )}

        {/* Time */}
        <span className="text-[11px] text-[#3f3f46]">{timeAgo}</span>
      </div>
    </div>
  );
}

function DayHeader({ date }: { date: Date }) {
  let label: string;
  
  if (isToday(date)) {
    label = 'Today';
  } else if (isYesterday(date)) {
    label = 'Yesterday';
  } else {
    label = format(date, 'EEEE, MMM d');
  }
  
  return (
    <div className="sticky top-0 z-10 px-4 py-2 bg-[#09090b] border-b border-[#27272a]">
      <span className="text-[11px] font-medium text-[#71717a]">{label}</span>
    </div>
  );
}

export function PlanningActivityFeed({
  activities,
  workspaceSlug,
  isLoading = false,
}: PlanningActivityFeedProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups: { date: Date; activities: IssueMovement[] }[] = [];
    let currentDate: string | null = null;
    let currentGroup: IssueMovement[] = [];

    for (const activity of activities) {
      const activityDate = format(new Date(activity.movedAt), 'yyyy-MM-dd');
      
      if (activityDate !== currentDate) {
        if (currentGroup.length > 0 && currentDate) {
          groups.push({
            date: new Date(currentDate),
            activities: currentGroup,
          });
        }
        currentDate = activityDate;
        currentGroup = [activity];
      } else {
        currentGroup.push(activity);
      }
    }
    
    if (currentGroup.length > 0 && currentDate) {
      groups.push({
        date: new Date(currentDate),
        activities: currentGroup,
      });
    }
    
    return groups;
  }, [activities]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-5 w-5 animate-pulse mx-auto mb-2 text-[#52525b]" />
          <p className="text-[13px] text-[#52525b]">Loading...</p>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[13px] text-[#3f3f46]">No activity found</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {groupedActivities.map((group) => (
          <div key={format(group.date, 'yyyy-MM-dd')}>
            <DayHeader date={group.date} />
            <div className="py-1">
              {group.activities.map((activity, idx) => (
                <ActivityItem
                  key={`${activity.issueId}-${idx}`}
                  activity={activity}
                  workspaceSlug={workspaceSlug}
                  onOpenModal={setSelectedIssueId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </>
  );
}


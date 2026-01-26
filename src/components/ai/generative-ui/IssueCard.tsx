'use client';

import * as React from 'react';
import {
  Bug,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Zap,
  FileText,
  Milestone,
  User,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag,
  Bookmark,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export interface IssueData {
  id: string;
  key?: string;
  title: string;
  status?: string;
  priority?: string;
  type?: string;
  project?: string;
  assignee?: string | { name?: string; image?: string };
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  labels?: Array<{ id: string; name: string; color?: string }>;
  storyPoints?: number;
}

interface IssueCardProps {
  issue: IssueData;
  index?: number;
  compact?: boolean;
  onSelect?: (issue: IssueData) => void;
  workspaceSlug?: string;
}

// ============================================================================
// Helpers - Matching Kanban styles exactly
// ============================================================================

const getTypeConfig = (type?: string) => {
  const t = type?.toLowerCase() || '';
  if (t === 'bug') return { icon: Bug, color: '#ef4444' };
  if (t === 'milestone') return { icon: Milestone, color: '#a855f7' };
  if (t === 'feature') return { icon: Zap, color: '#22c55e' };
  if (t === 'story') return { icon: Bookmark, color: '#3b82f6' };
  if (t === 'epic') return { icon: Milestone, color: '#a855f7' };
  return { icon: FileText, color: '#6b7280' };
};

const getPriorityIcon = (priority?: string) => {
  const p = priority?.toUpperCase() || '';
  if (p === 'URGENT') return { icon: Flag, color: 'text-red-600' };
  if (p === 'HIGH') return { icon: ArrowUp, color: 'text-amber-600' };
  if (p === 'MEDIUM') return { icon: Minus, color: 'text-blue-600' };
  if (p === 'LOW') return { icon: ArrowDown, color: 'text-slate-500' };
  return null;
};

const getStatusColor = (status?: string) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete') || s.includes('closed')) return '#22c55e';
  if (s.includes('progress') || s.includes('review')) return '#3b82f6';
  if (s.includes('blocked')) return '#ef4444';
  return '#6e7681';
};

// ============================================================================
// IssueCard Component - Matching Kanban card style
// ============================================================================

export function IssueCard({ issue, index = 0, compact = false, onSelect, workspaceSlug }: IssueCardProps) {
  const router = useRouter();
  const typeConfig = getTypeConfig(issue.type);
  const priorityInfo = getPriorityIcon(issue.priority);
  const TypeIcon = typeConfig.icon;
  const assignee = typeof issue.assignee === 'string'
    ? { name: issue.assignee, image: undefined }
    : issue.assignee;

  const handleClick = () => {
    if (onSelect) {
      onSelect(issue);
    } else if (workspaceSlug && issue.key) {
      router.push(`/${workspaceSlug}/issues/${issue.key}`);
    }
  };

  // Compact mode - simple row
  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left',
          'bg-[#0a0a0a] hover:bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#333]',
          'transition-colors duration-150 group'
        )}
      >
        <Circle
          className="h-2.5 w-2.5 flex-shrink-0"
          style={{ color: getStatusColor(issue.status) }}
          fill={getStatusColor(issue.status)}
        />
        <span className="text-xs text-[#8b949e] font-mono font-medium shrink-0">{issue.key}</span>
        <span className="text-sm text-white truncate flex-1 group-hover:text-[#58a6ff] transition-colors">
          {issue.title}
        </span>
      </button>
    );
  }

  // Full card mode - matching Kanban
  return (
    <div
      onClick={handleClick}
      className={cn(
        'group block p-3 rounded-lg transition-colors duration-150 cursor-pointer',
        'bg-[#0a0a0a] border border-[#1f1f1f] hover:border-[#333]'
      )}
    >
      <div className="flex flex-col gap-1.5">
        {/* Header: Issue Key + Type + Priority + Assignee */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Type Indicator */}
            <TypeIcon
              className="h-3 w-3 flex-shrink-0"
              style={{ color: typeConfig.color }}
            />

            {/* Priority Indicator */}
            {priorityInfo && (
              <priorityInfo.icon className={cn('h-3 w-3', priorityInfo.color)} />
            )}

            {/* Issue Key */}
            <span className="text-xs font-mono text-[#8b949e] font-medium">
              {issue.key}
            </span>
          </div>

          {/* Assignee Avatar */}
          <div className="flex-shrink-0">
            {assignee?.name ? (
              <Avatar className="h-5 w-5">
                <AvatarImage src={assignee.image} />
                <AvatarFallback className="text-[10px] bg-[#1f1f1f] text-[#8b949e] font-medium">
                  {assignee.name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="h-5 w-5 rounded-full bg-[#1f1f1f] flex items-center justify-center">
                <User className="h-2.5 w-2.5 text-[#6e7681]" />
              </div>
            )}
          </div>
        </div>

        {/* Issue Title */}
        <h4 className="text-white text-sm font-medium leading-5 line-clamp-2 group-hover:text-[#58a6ff] transition-colors">
          {issue.title}
        </h4>

        {/* Badges Row */}
        <div className="flex flex-wrap gap-1 items-center">
          {/* Project Badge */}
          {issue.project && (
            <Badge
              className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm bg-[#6e7681]/25 text-[#8b949e]"
            >
              {issue.project}
            </Badge>
          )}

          {/* Due Date Badge */}
          {issue.dueDate && (
            <Badge className="h-4 px-1.5 text-[10px] font-medium leading-none bg-orange-500/20 text-orange-400 border-0 rounded-sm">
              {format(new Date(issue.dueDate), 'MMM d')}
            </Badge>
          )}

          {/* Labels */}
          {issue.labels?.slice(0, 2).map((label) => (
            <Badge
              key={label.id}
              className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm"
              style={{
                backgroundColor: (label.color || '#6e7681') + '25',
                color: label.color || '#8b949e'
              }}
            >
              {label.name}
            </Badge>
          ))}

          {/* Story Points */}
          {issue.storyPoints && (
            <Badge className="h-4 px-1.5 text-[10px] font-medium leading-none bg-blue-500/20 text-blue-400 border-0 rounded-sm">
              {issue.storyPoints} pts
            </Badge>
          )}

          {/* Status Badge */}
          {issue.status && (
            <Badge
              className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm"
              style={{
                backgroundColor: getStatusColor(issue.status) + '20',
                color: getStatusColor(issue.status)
              }}
            >
              {issue.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Issue List Component
// ============================================================================

interface IssueListProps {
  issues: IssueData[];
  title?: string;
  compact?: boolean;
  maxDisplay?: number;
  onSelectIssue?: (issue: IssueData) => void;
  workspaceSlug?: string;
}

export function IssueList({
  issues,
  title,
  compact = false,
  maxDisplay = 10,
  onSelectIssue,
  workspaceSlug,
}: IssueListProps) {
  const displayIssues = issues.slice(0, maxDisplay);
  const remaining = issues.length - maxDisplay;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">{title}</h3>
          <span className="text-xs text-[#52525b]">{issues.length} items</span>
        </div>
      )}

      <div className={cn(compact ? 'space-y-1' : 'grid grid-cols-1 gap-2')}>
        {displayIssues.map((issue, index) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            index={index}
            compact={compact}
            onSelect={onSelectIssue}
            workspaceSlug={workspaceSlug}
          />
        ))}
      </div>

      {remaining > 0 && (
        <button className="w-full text-center text-xs text-[#52525b] hover:text-[#a1a1aa] py-2 transition-colors">
          +{remaining} more items
        </button>
      )}
    </div>
  );
}

export default IssueCard;

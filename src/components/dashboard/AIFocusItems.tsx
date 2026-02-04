"use client";

import React from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface FocusItem {
  id: string;
  issueKey: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | null;
  status: string | null;
  statusColor?: string | null;
  dueDate?: string | null;
  assignee?: {
    name: string | null;
    image: string | null;
  } | null;
  project?: {
    name: string;
    color: string | null;
  } | null;
  reason: 'overdue' | 'due-today' | 'at-risk' | 'high-priority' | 'blocked';
}

interface AIFocusItemsProps {
  items: FocusItem[];
  workspaceSlug: string;
  isLoading?: boolean;
}

const priorityConfig = {
  urgent: { label: 'Urgent', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  high: { label: 'High', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  medium: { label: 'Medium', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  low: { label: 'Low', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
};

const reasonConfig = {
  overdue: { label: 'Overdue', icon: AlertCircle, color: 'text-red-400' },
  'due-today': { label: 'Due today', icon: Clock, color: 'text-amber-400' },
  'at-risk': { label: 'At risk', icon: AlertCircle, color: 'text-orange-400' },
  'high-priority': { label: 'High priority', icon: AlertCircle, color: 'text-red-400' },
  blocked: { label: 'Blocked', icon: AlertCircle, color: 'text-red-400' },
};

function FocusItemRow({
  item,
  workspaceSlug,
}: {
  item: FocusItem;
  workspaceSlug: string;
}) {
  const ReasonIcon = reasonConfig[item.reason]?.icon || AlertCircle;
  const reasonColor = reasonConfig[item.reason]?.color || 'text-[#52525b]';

  return (
    <Link
      href={`/${workspaceSlug}/issues/${item.issueKey}`}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg",
        "bg-[#1f1f1f]/50 border border-[#27272a]",
        "hover:bg-[#1f1f1f] hover:border-[#3f3f46]",
        "transition-all duration-200 group"
      )}
    >
      {/* Status indicator */}
      <Circle
        className="h-2.5 w-2.5 flex-shrink-0"
        style={{ color: item.statusColor || '#52525b' }}
        fill={item.statusColor || '#52525b'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] text-[#52525b] font-mono">{item.issueKey}</span>
          {item.project && (
            <>
              <span className="text-[#3f3f46]">•</span>
              <span className="text-[10px] text-[#52525b]">{item.project.name}</span>
            </>
          )}
        </div>
        <p className="text-sm text-[#fafafa] truncate group-hover:text-white">
          {item.title}
        </p>
      </div>

      {/* Priority badge */}
      {item.priority && priorityConfig[item.priority] && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 h-5 border",
            priorityConfig[item.priority].color
          )}
        >
          {priorityConfig[item.priority].label}
        </Badge>
      )}

      {/* Reason indicator */}
      <div className={cn("flex items-center gap-1", reasonColor)}>
        <ReasonIcon className="h-3.5 w-3.5" />
        <span className="text-[10px]">{reasonConfig[item.reason]?.label}</span>
      </div>

      {/* Assignee */}
      {item.assignee && (
        <Avatar className="h-6 w-6 flex-shrink-0">
          <AvatarImage src={item.assignee.image || undefined} />
          <AvatarFallback className="text-[8px] bg-[#27272a]">
            {item.assignee.name?.charAt(0) || '?'}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 text-[#3f3f46] opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

export default function AIFocusItems({
  items,
  workspaceSlug,
  isLoading,
}: AIFocusItemsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-[#1f1f1f]/50 border border-[#27272a] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500/50 mb-3" />
        <h3 className="text-sm font-medium text-[#fafafa] mb-1">All caught up!</h3>
        <p className="text-xs text-[#52525b]">No urgent items need your attention right now.</p>
      </div>
    );
  }

  const critical = items.filter(i => i.reason === 'overdue' || i.reason === 'blocked');
  const important = items.filter(i => i.reason !== 'overdue' && i.reason !== 'blocked');

  return (
    <div className="space-y-4">
      {/* Critical items */}
      {critical.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">
              Critical ({critical.length})
            </span>
          </div>
          <div className="space-y-2">
            {critical.slice(0, 3).map((item) => (
              <FocusItemRow
                key={item.id}
                item={item}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        </div>
      )}

      {/* Important items */}
      {important.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
              Needs attention ({important.length})
            </span>
          </div>
          <div className="space-y-2">
            {important.slice(0, 5).map((item) => (
              <FocusItemRow
                key={item.id}
                item={item}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

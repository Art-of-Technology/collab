"use client";

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterChipProps {
  label: string;
  values: string[];
  onRemove: () => void;
  className?: string;
}

const FILTER_COLORS: Record<string, string> = {
  status: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40',
  priority: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:border-amber-500/40',
  type: 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:border-purple-500/40',
  assignee: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:border-blue-500/40',
  reporter: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:border-cyan-500/40',
  labels: 'bg-pink-500/10 text-pink-400 border-pink-500/20 hover:border-pink-500/40',
  project: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40',
  updatedAt: 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:border-orange-500/40',
  updated: 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:border-orange-500/40',
  actions: 'bg-red-500/10 text-red-400 border-red-500/20 hover:border-red-500/40',
  activity: 'bg-red-500/10 text-red-400 border-red-500/20 hover:border-red-500/40',
};

const FILTER_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  assignee: 'Assignee',
  reporter: 'Reporter',
  labels: 'Labels',
  project: 'Project',
  updatedAt: 'Updated',
  actions: 'Activity',
};

export function getFilterLabel(key: string): string {
  return FILTER_LABELS[key] || key;
}

export function getFilterColor(key: string): string {
  return FILTER_COLORS[key] || 'bg-collab-700/50 text-collab-300 border-collab-600 hover:border-collab-500';
}

/**
 * Resolve raw filter IDs to human-readable display names.
 * Falls back to the raw value if no lookup match is found.
 */
export function resolveFilterValues(
  key: string,
  rawValues: string[],
  metadata: FilterMetadata,
): string[] {
  switch (key) {
    case 'status': {
      const { statuses } = metadata;
      if (!statuses?.length) return rawValues;
      return rawValues.map(id => {
        const s = statuses.find(st => st.id === id);
        return s?.displayName || s?.name || id;
      });
    }
    case 'assignee':
    case 'reporter': {
      const { members } = metadata;
      if (!members?.length) return rawValues;
      return rawValues.map(id => {
        if (id === 'unassigned') return 'Unassigned';
        const m = members.find(mem => mem.id === id);
        return m?.name || id;
      });
    }
    case 'labels': {
      const { labels } = metadata;
      if (!labels?.length) return rawValues;
      return rawValues.map(id => {
        if (id === 'no-labels') return 'No labels';
        const l = labels.find(lb => lb.id === id);
        return l?.name || id;
      });
    }
    case 'priority':
      return rawValues.map(v => {
        const map: Record<string, string> = {
          urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'No priority',
        };
        return map[v] || v;
      });
    case 'type':
      return rawValues.map(v => {
        const map: Record<string, string> = {
          TASK: 'Task', BUG: 'Bug', FEATURE: 'Feature', IMPROVEMENT: 'Improvement',
          STORY: 'Story', EPIC: 'Epic', SUBTASK: 'Sub-task',
        };
        return map[v] || v;
      });
    case 'updatedAt':
      return rawValues.map(v => {
        const map: Record<string, string> = {
          today: 'Today', yesterday: 'Yesterday',
          'last-3-days': 'Last 3 days', 'last-7-days': 'Last 7 days', 'last-30-days': 'Last 30 days',
        };
        return map[v] || v;
      });
    default:
      return rawValues;
  }
}

export interface FilterMetadata {
  statuses?: Array<{ id: string; name: string; displayName: string }>;
  members?: Array<{ id: string; name: string }>;
  labels?: Array<{ id: string; name: string }>;
}

export default function FilterChip({ label, values, onRemove, className }: FilterChipProps) {
  const colorKey = label.toLowerCase().replace(/\s+/g, '');
  const colorClass = getFilterColor(colorKey);
  const displayValues = values.length <= 2 ? values.join(', ') : `${values.length} selected`;

  return (
    <div
      className={cn(
        "group inline-flex items-center gap-1 h-6 px-2 text-[12px] rounded-md border transition-colors cursor-default",
        colorClass,
        className
      )}
    >
      <span className="font-medium opacity-70">{label}:</span>
      <span className="truncate max-w-[140px]">{displayValues}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity rounded-sm"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

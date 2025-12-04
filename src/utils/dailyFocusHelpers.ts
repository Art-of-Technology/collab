import {
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  Zap,
  Circle,
  AlertTriangle,
  Flame,
  RefreshCw,
} from 'lucide-react';
import { ReflectionStatus } from '@prisma/client';

export interface StatusConfig {
  icon: typeof CheckCircle2;
  label: string;
  color: string;
  bgColor: string;
}

export const REFLECTION_STATUS_CONFIG: Record<ReflectionStatus, StatusConfig> = {
  COMPLETED: {
    icon: CheckCircle2,
    label: 'Completed',
    color: '#22c55e',
    bgColor: 'bg-green-500/20',
  },
  COULD_NOT_COMPLETE: {
    icon: XCircle,
    label: 'Could Not Complete',
    color: '#ef4444',
    bgColor: 'bg-red-500/20',
  },
  PAUSED: {
    icon: Clock,
    label: 'Paused',
    color: '#f59e0b',
    bgColor: 'bg-yellow-500/20',
  },
  PENDING_INPUT: {
    icon: GitBranch,
    label: 'Pending Input',
    color: '#06b6d4',
    bgColor: 'bg-cyan-500/20',
  },
  UNPLANNED_WORK: {
    icon: Zap,
    label: 'Unplanned Work',
    color: '#8b5cf6',
    bgColor: 'bg-purple-500/20',
  },
  UNTOUCHED: {
    icon: Circle,
    label: 'Untouched',
    color: '#6b7280',
    bgColor: 'bg-gray-500/20',
  },
};

export const getStatusConfig = (status: ReflectionStatus): StatusConfig => {
  return REFLECTION_STATUS_CONFIG[status] || REFLECTION_STATUS_CONFIG.UNTOUCHED;
};

export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateFull = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const isToday = (date: Date | string): boolean => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
};

export const isYesterday = (date: Date | string): boolean => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
};

export const getRelativeDateLabel = (date: Date | string): string => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return formatDate(date);
};

export const groupReflectionsByStatus = (reflections: any[]) => {
  const grouped: Record<ReflectionStatus, any[]> = {
    COMPLETED: [],
    COULD_NOT_COMPLETE: [],
    PAUSED: [],
    PENDING_INPUT: [],
    UNPLANNED_WORK: [],
    UNTOUCHED: [],
  };

  reflections.forEach((reflection) => {
    if (grouped[reflection.status]) {
      grouped[reflection.status].push(reflection);
    }
  });

  return grouped;
};

export const getStatusCounts = (reflections: any[]) => {
  const counts: Record<ReflectionStatus, number> = {
    COMPLETED: 0,
    COULD_NOT_COMPLETE: 0,
    PAUSED: 0,
    PENDING_INPUT: 0,
    UNPLANNED_WORK: 0,
    UNTOUCHED: 0,
  };

  reflections.forEach((reflection) => {
    if (counts[reflection.status] !== undefined) {
      counts[reflection.status]++;
    }
  });

  return counts;
};



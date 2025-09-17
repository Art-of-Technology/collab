"use client";

import { 
  PlusCircle, 
  Edit3, 
  ArrowRightLeft, 
  AlertTriangle, 
  Clock,
  User,
  Calendar,
  Tag,
  Target,
  FileText,
  Palette,
  Move,
  Play,
  Pause,
  Square,
  Eye
} from 'lucide-react';
import { ActivityIconProps } from '../types/activity';
import { cn } from '@/lib/utils';

export function ActivityIcon({ action, className }: ActivityIconProps) {
  const getIcon = () => {
    switch (action) {
      case 'CREATED':
        return <PlusCircle className="h-3 w-3 text-green-500" />;
      case 'UPDATED':
      case 'TITLE_UPDATED':
      case 'DESCRIPTION_UPDATED':
        return <Edit3 className="h-3 w-3 text-blue-500" />;
      case 'MOVED':
      case 'COLUMN_CHANGED':
        return <Move className="h-3 w-3 text-purple-500" />;
      case 'STATUS_CHANGED':
        return <ArrowRightLeft className="h-3 w-3 text-indigo-500" />;
      case 'PRIORITY_CHANGED':
        return <AlertTriangle className="h-3 w-3 text-orange-500" />;
      case 'ASSIGNED':
      case 'UNASSIGNED':
      case 'REPORTER_CHANGED':
        return <User className="h-3 w-3 text-cyan-500" />;
      case 'DUE_DATE_SET':
      case 'DUE_DATE_CHANGED':
      case 'DUE_DATE_REMOVED':
        return <Calendar className="h-3 w-3 text-rose-500" />;
      case 'LABELS_CHANGED':
        return <Tag className="h-3 w-3 text-yellow-500" />;
      case 'STORY_POINTS_CHANGED':
        return <Target className="h-3 w-3 text-emerald-500" />;
      case 'TYPE_CHANGED':
        return <FileText className="h-3 w-3 text-violet-500" />;
      case 'COLOR_CHANGED':
        return <Palette className="h-3 w-3 text-pink-500" />;
      case 'TASK_PLAY_STARTED':
        return <Play className="h-3 w-3 text-green-600" />;
      case 'TASK_PLAY_STOPPED':
        return <Square className="h-3 w-3 text-red-500" />;
      case 'TASK_PLAY_PAUSED':
        return <Pause className="h-3 w-3 text-yellow-600" />;
      case 'TIME_ADJUSTED':
        return <Clock className="h-3 w-3 text-blue-500" />;
      case 'SESSION_EDITED':
        return <Edit3 className="h-3 w-3 text-indigo-500" />;
      case 'HELP_REQUEST_SENT':
      case 'HELP_REQUEST_APPROVED':
      case 'HELP_REQUEST_REJECTED':
        return <User className="h-3 w-3 text-purple-500" />;
      case 'VIEWED':
        return <Eye className="h-3 w-3 text-slate-500" />;
      default:
        return <Clock className="h-3 w-3 text-[#666]" />;
    }
  };

  return (
    <div className={cn("flex-shrink-0", className)}>
      {getIcon()}
    </div>
  );
}

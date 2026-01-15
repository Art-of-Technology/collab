"use client";

import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

const FILTER_LABELS = {
  status: 'Status',
  priority: 'Priority',
  type: 'Issue Type',
  assignee: 'Assignee',
  project: 'Project',
  reporter: 'Reporter',
  labels: 'Labels'
};

const formatFilterValue = (value: string): string => {
  switch (value) {
    case 'URGENT': return 'Urgent';
    case 'HIGH': return 'High';
    case 'MEDIUM': return 'Medium';
    case 'LOW': return 'Low';
    case 'EPIC': return 'Epic';
    case 'STORY': return 'Story';
    case 'TASK': return 'Task';
    case 'BUG': return 'Bug';
    case 'MILESTONE': return 'Milestone';
    case 'SUBTASK': return 'Subtask';
    default: return value;
  }
};

interface FilterTagsProps {
  filters: Record<string, string[]>;
  onRemove: (filterId: string, value?: string) => void;
  projects?: Array<{ id: string; name: string; }>;
  variant?: 'modal' | 'toolbar';
}

export default function FilterTags({
  filters,
  onRemove,
  projects = [],
  variant = 'toolbar'
}: FilterTagsProps) {
  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || projectId;
  };

  const renderFilterValue = (filterId: string, value: string) => {
    if (filterId === 'project') {
      return getProjectName(value);
    }
    return formatFilterValue(value);
  };

  const isModalVariant = variant === 'modal';

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(filters).map(([filterId, values]) => 
        (values as string[]).map((value: string) => (
          <Badge 
            key={`${filterId}-${value}`}
            variant="secondary"
            className={isModalVariant
              ? "h-7 px-2 bg-[#1f1f1f] text-white border border-[#2a2a2a] flex items-center gap-2"
              : "h-8 px-3 bg-[#1f1f1f] text-white border border-[#2a2a2a] flex items-center gap-2"
            }
          >
            <span className="text-[#999]">
              {FILTER_LABELS[filterId as keyof typeof FILTER_LABELS] || filterId}:
            </span>
            <span>{renderFilterValue(filterId, value)}</span>
            <Button
              variant="ghost"
              onClick={() => onRemove(filterId, value)}
              className="text-[#666] hover:text-white transition-colors p-0 h-auto"
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))
      )}
    </div>
  );
} 